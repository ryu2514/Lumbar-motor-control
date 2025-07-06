import type { NormalizedLandmark } from "../types";
import { validateAngle, validateNormalizedCoordinate } from "./securityUtils";
import { securityLogger } from "./securityLogger";

/**
 * ラジアンから度に変換
 */
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * 2点間のベクトルを計算
 */
export const calculateVector = (pointA: NormalizedLandmark, pointB: NormalizedLandmark) => {
  // 座標の検証
  if (!validateNormalizedCoordinate(pointA.x) || !validateNormalizedCoordinate(pointA.y) ||
      !validateNormalizedCoordinate(pointB.x) || !validateNormalizedCoordinate(pointB.y)) {
    securityLogger.logEvent(
      'invalid_data_detected',
      'medium',
      'Invalid coordinate data detected in vector calculation',
      { pointA, pointB }
    );
    return { x: 0, y: 0, z: 0 };
  }
  
  return {
    x: pointB.x - pointA.x,
    y: pointB.y - pointA.y,
    z: pointB.z - pointA.z
  };
};

/**
 * ベクトルの大きさを計算
 */
export const calculateMagnitude = (vector: { x: number; y: number; z: number }) =>
  Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);

/**
 * 2つのベクトル間の角度を計算（3D）
 */
export const calculateAngleBetweenVectors = (v1: any, v2: any) => {
  // ベクトルの検証
  if (!v1 || !v2 || typeof v1.x !== 'number' || typeof v1.y !== 'number' || typeof v1.z !== 'number' ||
      typeof v2.x !== 'number' || typeof v2.y !== 'number' || typeof v2.z !== 'number') {
    securityLogger.logEvent(
      'invalid_data_detected',
      'medium',
      'Invalid vector data detected in angle calculation',
      { v1, v2 }
    );
    return 0;
  }
  
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = calculateMagnitude(v1);
  const mag2 = calculateMagnitude(v2);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 + 1e-6))));
  
  // 角度の検証
  if (!validateAngle(radToDeg(angle))) {
    securityLogger.logEvent(
      'invalid_data_detected',
      'medium',
      'Invalid angle calculated',
      { angle: radToDeg(angle), v1, v2 }
    );
    return 0;
  }
  
  return angle;
};

/**
 * 3点による角度を計算（2D）
 */
export const calculate2DAngle = (p1: any, vertex: any, p2: any) => {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 + 1e-6))));
};

/**
 * 胸腰椎屈曲・伸展角度を計算（日本整形外科学会基準対応）
 * @param shoulderMid 肩の中心点
 * @param hipMid 腰の中心点  
 * @returns 胸腰椎角度（度）- 正の値: 屈曲（前屈）、負の値: 伸展（後屈）
 * 
 * 注意事項:
 * - 胸腰椎一括測定のため、純粋な腰椎単独の動きではない
 * - 骨盤前傾時は腰椎伸展として検出される傾向がある
 * - カメラ角度や姿勢により誤差が生じやすい
 * 
 * 日本整形外科学会基準: 胸腰椎屈曲45°/伸展30°
 */
export const calculateLumbarFlexionExtension = (
  shoulderMid: { x: number; y: number; z: number },
  hipMid: { x: number; y: number; z: number }
) => {
  // MediaPipe座標系での前後傾角度計算
  // 重要：MediaPipeのZ軸の向きを確認して修正
  
  // 前屈と後屈の判定基準を修正（デバッグログに基づく）
  // 実際のログから判明：前屈時 Z差=-0.070 (肩が腰よりカメラから遠い)
  // MediaPipe Z軸: 正方向 = カメラから遠ざかる方向
  
  const shoulderToHipZ = shoulderMid.z - hipMid.z; // Z方向の差
  const shoulderToHipY = shoulderMid.y - hipMid.y; // Y方向の差（負が上方向）
  
  // 角度計算を修正：Z軸の符号を反転して正しい前屈/後屈を検出
  // 前屈時: shoulderToHipZ < 0 → 正の角度にする
  // 後屈時: shoulderToHipZ > 0 → 負の角度にする
  let lumbarAngle = Math.atan2(-shoulderToHipZ, -shoulderToHipY); // Z軸とY軸両方を反転
  lumbarAngle = radToDeg(lumbarAngle);
  
  // これで前屈時に正の角度、後屈時に負の角度になるはず
  
  // ノイズフィルタリング（座位膝伸展テストでは感度を上げる）
  if (Math.abs(lumbarAngle) < 1) {
    lumbarAngle = 0; // 非常に小さな動きのみ中立とする
  }
  
  // 現実的な腰椎可動域にスケーリング
  // 前屈時は0.8倍、後屈時は1.0倍で調整
  if (lumbarAngle > 0) {
    lumbarAngle *= 0.8; // 前屈スケーリング
  } else {
    lumbarAngle *= 1.0; // 後屈スケーリング
  }
  
  // 最大可動域の制限（前屈60°、後屈40°）
  lumbarAngle = Math.max(-40, Math.min(60, lumbarAngle));
  
  return lumbarAngle;
};

/**
 * 2点の中点を計算
 */
export const calculateMidpoint = (
  point1: { x: number; y: number; z: number },
  point2: { x: number; y: number; z: number }
) => ({
  x: (point1.x + point2.x) / 2,
  y: (point1.y + point2.y) / 2,
  z: (point1.z + point2.z) / 2
});

/**
 * 角度の移動平均フィルター（ノイズ除去用）
 */
class AngleFilter {
  private history: number[] = [];
  private maxHistory = 3; // 履歴を3点に削減してより応答性を向上

  filter(angle: number): number {
    this.history.push(angle);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    // 重み付き移動平均を計算（最新の値により大きな重みを付与）
    if (this.history.length === 1) {
      return this.history[0];
    } else if (this.history.length === 2) {
      return (this.history[0] * 0.3 + this.history[1] * 0.7);
    } else {
      return (this.history[0] * 0.2 + this.history[1] * 0.3 + this.history[2] * 0.5);
    }
  }

  reset(): void {
    this.history = [];
  }
}

// グローバルなフィルターインスタンス
const angleFilter = new AngleFilter();

/**
 * フィルター適用済みの腰椎角度計算
 * @param shoulderMid 肩の中心点
 * @param hipMid 腰の中心点
 * @returns フィルター適用済みの角度
 */
export const calculateFilteredLumbarAngle = (
  shoulderMid: { x: number; y: number; z: number },
  hipMid: { x: number; y: number; z: number }
): number => {
  const rawAngle = calculateLumbarFlexionExtension(shoulderMid, hipMid);
  const filteredAngle = angleFilter.filter(rawAngle);
  
  // デバッグ用ログ（開発時のみ）
  if (Math.random() < 0.1) { // 10%の確率でログ出力（デバッグ用）
    // 体幹ベクトルも表示
    const torsoVector = {
      x: shoulderMid.x - hipMid.x,
      y: shoulderMid.y - hipMid.y,
      z: shoulderMid.z - hipMid.z
    };
    
    console.log('🔍 腰椎角度計算詳細:', {
      肩座標: { y: shoulderMid.y.toFixed(3), z: shoulderMid.z.toFixed(3) },
      腰座標: { y: hipMid.y.toFixed(3), z: hipMid.z.toFixed(3) },
      'Z差(肩-腰)': (shoulderMid.z - hipMid.z).toFixed(3),
      'Y差(肩-腰)': (shoulderMid.y - hipMid.y).toFixed(3),
      体幹ベクトル: { y: torsoVector.y.toFixed(3), z: torsoVector.z.toFixed(3) },
      生角度: rawAngle.toFixed(1) + '°',
      フィルター後: filteredAngle.toFixed(1) + '°',
      判定: filteredAngle > 5 ? '🔴屈曲' : filteredAngle < -5 ? '🔵伸展' : '⚪中立'
    });
  }
  
  return filteredAngle;
};

/**
 * 角度フィルターをリセット（新しい動画開始時など）
 */
export const resetAngleFilter = (): void => {
  angleFilter.reset();
  dynamicStabilityAnalyzer.reset();
};

/**
 * 股関節角度を計算（大腿骨-骨盤の角度）
 */
export const calculateHipAngle = (
  shoulderMid: { x: number; y: number; z: number },
  hipMid: { x: number; y: number; z: number },
  kneeMid: { x: number; y: number; z: number }
): number => {
  // 骨盤ライン（胴体ベクトル）
  const pelvisVector = {
    x: shoulderMid.x - hipMid.x,
    y: shoulderMid.y - hipMid.y,
    z: shoulderMid.z - hipMid.z
  };
  
  // 大腿骨ライン
  const femurVector = {
    x: kneeMid.x - hipMid.x,
    y: kneeMid.y - hipMid.y,
    z: kneeMid.z - hipMid.z
  };
  
  // 2D投影での股関節角度計算（矢状面）
  const hipAngle = Math.atan2(-femurVector.z, -femurVector.y) - Math.atan2(-pelvisVector.z, -pelvisVector.y);
  return radToDeg(hipAngle);
};

/**
 * 動的安定性解析クラス
 * 股関節運動中の腰椎安定性を評価
 */
class DynamicStabilityAnalyzer {
  private lumbarHistory: number[] = [];
  private hipHistory: number[] = [];
  private timeHistory: number[] = [];
  private maxHistory = 150; // 約5秒分の履歴（30fps想定）
  
  /**
   * 新しいデータポイントを追加
   */
  addDataPoint(lumbarAngle: number, hipAngle: number, timestamp: number): void {
    this.lumbarHistory.push(lumbarAngle);
    this.hipHistory.push(hipAngle);
    this.timeHistory.push(timestamp);
    
    // 履歴サイズを制限
    if (this.lumbarHistory.length > this.maxHistory) {
      this.lumbarHistory.shift();
      this.hipHistory.shift();
      this.timeHistory.shift();
    }
  }
  
  /**
   * 股関節運動期間中の腰椎安定性を評価
   */
  analyzeLumbarStability(): {
    hipMovementPhases: Array<{start: number, end: number, hipRange: number}>;
    lumbarStabilityScore: number;
    lumbarExcessiveMovement: number;
    hipLumbarRatio: number;
    stabilityGrade: 'excellent' | 'good' | 'fair' | 'poor';
  } {
    if (this.hipHistory.length < 10) {
      // データが少ない場合は、直近の安定性を簡易評価
      if (this.lumbarHistory.length > 0 && this.hipHistory.length > 0) {
        const recentLumbarVariation = this.lumbarHistory.length > 1 ? 
          Math.abs(this.lumbarHistory[this.lumbarHistory.length - 1] - this.lumbarHistory[0]) : 0;
        const recentHipVariation = this.hipHistory.length > 1 ? 
          Math.abs(this.hipHistory[this.hipHistory.length - 1] - this.hipHistory[0]) : 0;
        
        const ratio = recentHipVariation > 0 ? recentLumbarVariation / recentHipVariation : 0;
        const score = Math.max(0, 100 - (ratio * 100));
        
        return {
          hipMovementPhases: [],
          lumbarStabilityScore: score,
          lumbarExcessiveMovement: recentLumbarVariation,
          hipLumbarRatio: ratio,
          stabilityGrade: score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
        };
      }
      
      return {
        hipMovementPhases: [],
        lumbarStabilityScore: 50,
        lumbarExcessiveMovement: 0,
        hipLumbarRatio: 0,
        stabilityGrade: 'fair'
      };
    }
    
    // 1. 股関節運動期間を検出
    const hipMovementPhases = this.detectHipMovementPhases();
    
    // 2. 各運動期間での腰椎の安定性を評価
    let totalLumbarVariation = 0;
    let totalHipMovement = 0;
    
    for (const phase of hipMovementPhases) {
      const lumbarRange = this.calculateLumbarRangeInPhase(phase.start, phase.end);
      const hipRange = phase.hipRange;
      
      totalLumbarVariation += lumbarRange;
      totalHipMovement += hipRange;
    }
    
    // 3. 腰椎安定性スコア計算
    const hipLumbarRatio = totalHipMovement > 0 ? totalLumbarVariation / totalHipMovement : 0;
    const lumbarStabilityScore = Math.max(0, 100 - (hipLumbarRatio * 100));
    
    // 4. 過剰運動量（閾値を超えた腰椎変化）
    const lumbarExcessiveMovement = Math.max(0, totalLumbarVariation - (totalHipMovement * 0.3));
    
    // 5. 安定性グレード判定
    let stabilityGrade: 'excellent' | 'good' | 'fair' | 'poor';
    if (lumbarStabilityScore >= 80) stabilityGrade = 'excellent';
    else if (lumbarStabilityScore >= 60) stabilityGrade = 'good';
    else if (lumbarStabilityScore >= 40) stabilityGrade = 'fair';
    else stabilityGrade = 'poor';
    
    return {
      hipMovementPhases,
      lumbarStabilityScore,
      lumbarExcessiveMovement,
      hipLumbarRatio,
      stabilityGrade
    };
  }
  
  /**
   * 股関節運動期間を検出
   */
  private detectHipMovementPhases(): Array<{start: number, end: number, hipRange: number}> {
    const phases: Array<{start: number, end: number, hipRange: number}> = [];
    const threshold = 5; // 股関節角度変化の閾値（度）
    const minPhaseDuration = 15; // 最小期間（フレーム数）
    
    let inMovement = false;
    let phaseStart = 0;
    
    for (let i = 1; i < this.hipHistory.length; i++) {
      const hipChange = Math.abs(this.hipHistory[i] - this.hipHistory[i - 1]);
      
      if (!inMovement && hipChange > threshold) {
        // 運動開始
        inMovement = true;
        phaseStart = i;
      } else if (inMovement && hipChange < threshold / 2) {
        // 運動終了
        if (i - phaseStart >= minPhaseDuration) {
          const hipRange = this.calculateHipRangeInPhase(phaseStart, i);
          phases.push({
            start: phaseStart,
            end: i,
            hipRange
          });
        }
        inMovement = false;
      }
    }
    
    // 最後の期間が未完了の場合
    if (inMovement && this.hipHistory.length - phaseStart >= minPhaseDuration) {
      const hipRange = this.calculateHipRangeInPhase(phaseStart, this.hipHistory.length - 1);
      phases.push({
        start: phaseStart,
        end: this.hipHistory.length - 1,
        hipRange
      });
    }
    
    return phases;
  }
  
  /**
   * 指定期間での股関節可動域を計算
   */
  private calculateHipRangeInPhase(start: number, end: number): number {
    const phaseHipAngles = this.hipHistory.slice(start, end + 1);
    return Math.max(...phaseHipAngles) - Math.min(...phaseHipAngles);
  }
  
  /**
   * 指定期間での腰椎可動域を計算
   */
  private calculateLumbarRangeInPhase(start: number, end: number): number {
    const phaseLumbarAngles = this.lumbarHistory.slice(start, end + 1);
    return Math.max(...phaseLumbarAngles) - Math.min(...phaseLumbarAngles);
  }
  
  /**
   * データをリセット
   */
  reset(): void {
    this.lumbarHistory = [];
    this.hipHistory = [];
    this.timeHistory = [];
  }
}

// グローバルな動的安定性解析インスタンス
const dynamicStabilityAnalyzer = new DynamicStabilityAnalyzer();

/**
 * 動的安定性解析にデータポイントを追加
 */
export const addStabilityDataPoint = (
  lumbarAngle: number,
  hipAngle: number,
  timestamp: number
): void => {
  dynamicStabilityAnalyzer.addDataPoint(lumbarAngle, hipAngle, timestamp);
};

/**
 * 現在の腰椎安定性を解析
 */
export const analyzeLumbarStability = () => {
  return dynamicStabilityAnalyzer.analyzeLumbarStability();
};
