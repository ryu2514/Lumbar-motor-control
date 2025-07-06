/**
 * 座標データ匿名化専用ユーティリティ
 * MediaPipe pose landmarksの個人識別可能な情報を除去
 */

import type { NormalizedLandmark } from '../types';

// 条件付きインポート（循環依存を回避）
let securityLogger: any = { logEvent: () => {} };
let dataProtection: any = { isInitialized: false };

// 動的インポートでモジュールを読み込み
if (typeof window !== 'undefined') {
  Promise.all([
    import('./securityLogger').catch(() => null),
    import('./dataProtection').catch(() => null)
  ]).then(([loggerModule, protectionModule]) => {
    if (loggerModule) securityLogger = loggerModule.securityLogger;
    if (protectionModule) dataProtection = protectionModule.dataProtection;
  }).catch(error => {
    console.warn('Security modules not available:', error);
  });
}

export interface AnonymizationConfig {
  removePersonalLandmarks: boolean; // 顔・手など個人識別可能な点を除去
  relativizeCoordinates: boolean;   // 相対座標化
  noiseAddition: boolean;          // 微小なノイズ追加
  temporalSmoothing: boolean;      // 時系列平滑化
}

class CoordinateAnonymizer {
  private config: AnonymizationConfig = {
    removePersonalLandmarks: true,
    relativizeCoordinates: true,
    noiseAddition: true,
    temporalSmoothing: true
  };

  private previousFrames: NormalizedLandmark[][] = [];
  private readonly maxFrameHistory = 5;

  /**
   * 個人識別可能なランドマークのインデックス
   */
  private readonly personalLandmarks = [
    0,  // NOSE - 顔の特徴
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, // 顔の輪郭
    15, 16, // 手首
    17, 18, 19, 20, 21, 22, // 手の指
    29, 30, 31, 32 // 足の詳細（個人の歩行パターン特定可能）
  ];

  /**
   * 分析に必要な最小限のランドマーク（腰椎運動制御分析用）
   */
  private readonly essentialLandmarks = [
    11, 12, // 肩
    23, 24, // 腰
    25, 26, // 膝
    27, 28  // 足首
  ];

  /**
   * ランドマークデータの匿名化
   */
  anonymizeLandmarks(
    landmarks: NormalizedLandmark[],
    config?: Partial<AnonymizationConfig>
  ): NormalizedLandmark[] {
    if (!landmarks || landmarks.length === 0) {
      return landmarks;
    }

    const activeConfig = { ...this.config, ...config };
    let processed = [...landmarks];

    try {
      // 1. 個人識別可能なランドマークの除去/マスキング
      if (activeConfig.removePersonalLandmarks) {
        processed = this.removePersonalLandmarks(processed);
      }

      // 2. 相対座標化（体の中心基準）
      if (activeConfig.relativizeCoordinates) {
        processed = this.relativizeCoordinates(processed);
      }

      // 3. プライバシー保護ノイズの追加
      if (activeConfig.noiseAddition) {
        processed = this.addPrivacyNoise(processed);
      }

      // 4. 時系列平滑化（個人の動作パターン特徴を減少）
      if (activeConfig.temporalSmoothing) {
        processed = this.applySmoothingFilter(processed);
      }

      // フレーム履歴の更新
      this.updateFrameHistory(processed);

      if (securityLogger) {
        securityLogger.logEvent(
          'file_upload_accepted' as any,
          'low',
          'Landmark data anonymized',
          {
            originalCount: landmarks.length,
            processedCount: processed.length,
            config: activeConfig
          }
        );
      }

    } catch (error) {
      if (securityLogger) {
        securityLogger.logEvent(
          'error_occurred',
          'medium',
          'Landmark anonymization failed',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
      
      // エラー時は最小限の処理のみ実行
      processed = this.essentialAnonymization(landmarks);
    }

    return processed;
  }

  /**
   * 個人識別可能なランドマークの除去
   */
  private removePersonalLandmarks(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    return landmarks.map((landmark, index) => {
      if (this.personalLandmarks.includes(index)) {
        // 個人識別可能な点は中性的な値に置換
        return {
          x: 0.5, // 画面中央
          y: 0.5,
          z: 0,
          visibility: 0 // 不可視に設定
        };
      }
      return landmark;
    });
  }

  /**
   * 相対座標化（体幹中心基準）
   */
  private relativizeCoordinates(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    // 腰部中心を基準点として計算
    const hipLeft = landmarks[23];
    const hipRight = landmarks[24];
    
    if (!hipLeft || !hipRight) {
      return landmarks; // 基準点がない場合はそのまま返す
    }

    const center = {
      x: (hipLeft.x + hipRight.x) / 2,
      y: (hipLeft.y + hipRight.y) / 2,
      z: (hipLeft.z + hipRight.z) / 2
    };

    return landmarks.map(landmark => {
      if (!landmark || this.personalLandmarks.includes(landmarks.indexOf(landmark))) {
        return landmark;
      }

      return {
        ...landmark,
        x: landmark.x - center.x,
        y: landmark.y - center.y,
        z: landmark.z - center.z
      };
    });
  }

  /**
   * プライバシー保護ノイズの追加
   */
  private addPrivacyNoise(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    const noiseLevel = 0.001; // 分析精度に影響しない微小なノイズ

    return landmarks.map(landmark => {
      if (!landmark || landmark.visibility === 0) {
        return landmark;
      }

      // 暗号論的に安全な乱数でノイズ生成
      const noiseArray = new Float32Array(3);
      crypto.getRandomValues(noiseArray);
      
      return {
        ...landmark,
        x: landmark.x + (noiseArray[0] - 0.5) * noiseLevel,
        y: landmark.y + (noiseArray[1] - 0.5) * noiseLevel,
        z: landmark.z + (noiseArray[2] - 0.5) * noiseLevel
      };
    });
  }

  /**
   * 時系列平滑化フィルター
   */
  private applySmoothingFilter(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    if (this.previousFrames.length === 0) {
      return landmarks;
    }

    const smoothingFactor = 0.3; // 平滑化の強度

    return landmarks.map((landmark, index) => {
      if (!landmark || landmark.visibility === 0) {
        return landmark;
      }

      // 過去フレームとの加重平均
      let avgX = landmark.x;
      let avgY = landmark.y;
      let avgZ = landmark.z;
      let count = 1;

      this.previousFrames.forEach(frame => {
        if (frame[index] && frame[index].visibility && frame[index].visibility > 0) {
          avgX += frame[index].x;
          avgY += frame[index].y;
          avgZ += frame[index].z;
          count++;
        }
      });

      return {
        ...landmark,
        x: landmark.x * (1 - smoothingFactor) + (avgX / count) * smoothingFactor,
        y: landmark.y * (1 - smoothingFactor) + (avgY / count) * smoothingFactor,
        z: landmark.z * (1 - smoothingFactor) + (avgZ / count) * smoothingFactor
      };
    });
  }

  /**
   * フレーム履歴の更新
   */
  private updateFrameHistory(landmarks: NormalizedLandmark[]): void {
    this.previousFrames.push([...landmarks]);
    
    if (this.previousFrames.length > this.maxFrameHistory) {
      const removed = this.previousFrames.shift();
      if (removed && dataProtection) {
        dataProtection.secureDelete(removed);
      }
    }
  }

  /**
   * エラー時の最小限匿名化
   */
  private essentialAnonymization(landmarks: NormalizedLandmark[]): NormalizedLandmark[] {
    return landmarks.map((landmark, index) => {
      // 最低限の個人識別情報のみ除去
      if (index === 0 || (index >= 1 && index <= 10)) { // 顔部分のみ
        return {
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0
        };
      }
      return landmark;
    });
  }

  /**
   * 匿名化設定の更新
   */
  updateConfig(newConfig: Partial<AnonymizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (securityLogger) {
      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Anonymization config updated',
        { config: this.config }
      );
    }
  }

  /**
   * フレーム履歴のクリア
   */
  clearHistory(): void {
    if (dataProtection) {
      this.previousFrames.forEach(frame => {
        dataProtection.secureDelete(frame);
      });
    }
    this.previousFrames = [];
  }

  /**
   * 匿名化統計の取得
   */
  getAnonymizationStats(): Record<string, any> {
    return {
      config: this.config,
      frameHistoryLength: this.previousFrames.length,
      personalLandmarksCount: this.personalLandmarks.length,
      essentialLandmarksCount: this.essentialLandmarks.length
    };
  }
}

// シングルトンインスタンス
export const coordinateAnonymizer = new CoordinateAnonymizer();

// ページアンロード時のクリーンアップ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    coordinateAnonymizer.clearHistory();
  });
}