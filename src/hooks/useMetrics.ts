import { useState, useEffect, useRef } from 'react';
import type { Metric, PoseLandmarkerResult, TestType } from '../types';
import { LANDMARKS } from '../types';
import {
  calculateFilteredLumbarAngle,
  calculateMidpoint,
  resetAngleFilter
} from '../utils/geometryUtils';

// 座標匿名化機能を無効化（パフォーマンス向上のため）

/**
 * ポーズランドマークから評価指標を計算するカスタムフック
 */
export const useMetrics = (result: PoseLandmarkerResult | null, testType: TestType): Metric[] => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [movementHistory, setMovementHistory] = useState<any[]>([]);
  const [previousTestType, setPreviousTestType] = useState<TestType | null>(null);
  const frameCount = useRef(0);
  const updateCount = useRef(0);

  useEffect(() => {
    // テスト種類が変更された場合はフィルターをリセット
    if (previousTestType !== null && previousTestType !== testType) {
      resetAngleFilter();
    }
    setPreviousTestType(testType);

    if (!result || !result.worldLandmarks || result.worldLandmarks.length === 0) {
      // データが無い場合でも基本的な待機状態メトリクスを表示
      const waitingMetrics: Metric[] = [];
      
      // 全てのテストに腰椎安定性スコアと腰椎過剰運動量を含める
      waitingMetrics.push(
        {
          label: "腰椎安定性スコア",
          value: 0,
          unit: "点",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "70-100点（良好な制御）"
        },
        {
          label: "腰椎過剰運動量",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "0-8°（良好な制御）"
        }
      );
      
      // 立位股関節屈曲テストのみ腰椎屈曲・伸展角度を含める
      if (testType === 'standingHipFlex') {
        waitingMetrics.push({
          label: "腰椎屈曲・伸展角度",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "-15° 〜 +15°（中立位）"
        });
      }
      
      // テスト固有のメトリクスを追加
      if (testType === 'standingHipFlex') {
        // 立位股関節屈曲テストでは腰椎関連メトリクスのみ表示
      } else if (testType === 'rockBack') {
        // ロックバックテストでは腰椎関連メトリクスのみ表示
      } else if (testType === 'seatedKneeExt') {
        waitingMetrics.push(
          {
            label: "腰椎安定性スコア",
            value: 0,
            unit: "点",
            status: 'caution',
            description: '姿勢データを取得中...',
            normalRange: "80-100点（良好な安定性）"
          },
          {
            label: "腰椎過剰運動量",
            value: 0,
            unit: "°",
            status: 'caution',
            description: '姿勢データを取得中...',
            normalRange: "0-5°（適切な制御）"
          }
        );
      }
      
      setMetrics(waitingMetrics);
      return;
    }

    const originalLandmarks = result.worldLandmarks[0];
    
    // 座標データをそのまま使用（パフォーマンス優先）
    const landmarks = originalLandmarks;
    
    const calculatedMetrics: Metric[] = [];

    // 動作履歴を保存（タイミング分析用）- 頻度をさらに制限してパフォーマンス向上
    frameCount.current++;
    if (frameCount.current % 5 === 0) { // 5フレームに1回に削減
      setMovementHistory(prev => [...prev.slice(-9), landmarks]); // 直近10フレームに削減
    }

    // ランドマークの可視性チェック（より寛容に）
    const isLandmarkVisible = (index: number, threshold = 0.3) => {
      return landmarks[index] && (landmarks[index].visibility || 1) > threshold;
    };

    // 中点を計算
    const getMidpoint = (index1: number, index2: number) => ({
      x: (landmarks[index1].x + landmarks[index2].x) / 2,
      y: (landmarks[index1].y + landmarks[index2].y) / 2,
      z: (landmarks[index1].z + landmarks[index2].z) / 2
    });

    try {
      // 各テスト種類に応じた評価指標を計算
      switch (testType) {
        case "standingHipFlex":
          // 立位股関節屈曲テスト：腰椎過剰運動量を含める
          addLumbarFlexionExtensionMetric(landmarks, calculatedMetrics, isLandmarkVisible, testType);
          calculateStandingHipFlexMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint, movementHistory);
          break;
        case "rockBack":
          // ロックバックテスト：腰椎過剰運動量を含める
          addLumbarFlexionExtensionMetric(landmarks, calculatedMetrics, isLandmarkVisible, testType);
          calculateRockBackMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint);
          break;
        case "seatedKneeExt":
          // 座位膝関節伸展テスト：腰椎過剰運動量評価
          calculateSeatedKneeExtMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint, movementHistory);
          break;
        default:
          break;
      }
      // 総合点を計算
      const overallScore = calculateOverallScore(calculatedMetrics);
      calculatedMetrics.push(overallScore);
      
    } catch (error) {
      console.error("Metrics calculation error:", error);
    }

    // 座位膝関節伸展テストの更新頻度制限を一時的に無効化（グラフ問題調査）
    updateCount.current++;
    // if (testType === 'seatedKneeExt' && updateCount.current % 3 !== 0) {
    //   return; // 3回に1回のみ更新
    // }
    
    setMetrics(calculatedMetrics);
  }, [result, testType]); // movementHistoryを依存配列から除外してパフォーマンス向上

  return metrics;
};

/**
 * 総合点を計算する関数
 */
function calculateOverallScore(metrics: Metric[]): Metric {
  if (metrics.length === 0) {
    return {
      label: "総合評価スコア",
      value: 0,
      unit: "点",
      status: 'caution',
      description: '評価データが不足しています',
      normalRange: "80-100点（優秀）"
    };
  }

  let totalScore = 0;
  let validMetrics = 0;

  metrics.forEach(metric => {
    let normalizedScore = 0;

    // メトリクスの種類に応じて100点満点に正規化
    if (metric.label === "腰椎安定性スコア") {
      // 既に100点満点
      normalizedScore = metric.value;
    } else if (metric.label === "腰椎過剰運動量") {
      // 座位膝関節伸展テストでは緩やかな減点で総合評価スコアを上げる
      // 0-6°が100点、6-10°で緩やかな減点、10°以上で段階的減点
      if (metric.value <= 6) {
        normalizedScore = 100;
      } else if (metric.value <= 10) {
        normalizedScore = 100 - ((metric.value - 6) * 3); // 6°超えで3点ずつ減点（以前より緩やか）
      } else if (metric.value <= 20) {
        normalizedScore = Math.max(0, 88 - ((metric.value - 10) * 4)); // 10°超えで4点ずつ減点
      } else {
        normalizedScore = Math.max(0, 48 - ((metric.value - 20) * 2)); // 20°超えで2点ずつ減点
      }
    } else if (metric.label === "腰椎屈曲・伸展角度") {
      // -15°〜+15°の範囲で100点、それを超えると減点
      const deviation = Math.abs(metric.value);
      normalizedScore = Math.max(0, 100 - (Math.max(0, deviation - 15) * 5));
    } else if (metric.label === "座位腰椎制御スコア") {
      // 既に適切にスコア化されているのでそのまま使用
      normalizedScore = metric.value;
    } else if (metric.label === "腰椎アライメント") {
      // 0-15°の範囲で100点
      if (metric.value <= 15) {
        normalizedScore = 100 - (metric.value * 2);
      } else if (metric.value <= 30) {
        normalizedScore = Math.max(0, 70 - ((metric.value - 15) * 3));
      } else {
        normalizedScore = Math.max(0, 25 - ((metric.value - 30) * 1));
      }
    }

    totalScore += normalizedScore;
    validMetrics++;
  });

  const averageScore = validMetrics > 0 ? totalScore / validMetrics : 0;

  // 総合評価ステータスを決定
  let status: 'normal' | 'caution' | 'abnormal' = 'normal';
  let description = '総合的な運動制御評価';

  if (averageScore >= 80) {
    status = 'normal';
    description = '優秀な運動制御能力';
  } else if (averageScore >= 60) {
    status = 'caution';
    description = '良好な運動制御能力（改善の余地あり）';
  } else {
    status = 'abnormal';
    description = '運動制御能力に課題があります';
  }

  return {
    label: "総合評価スコア",
    value: Number(averageScore.toFixed(1)),
    unit: "点",
    status: status,
    description: description,
    normalRange: "80-100点（優秀）"
  };
}

/**
 * 動的腰椎安定性評価を計算して指標に追加する関数
 */
function addLumbarFlexionExtensionMetric(
  landmarks: any[],
  metrics: Metric[],
  isLandmarkVisible: (index: number, threshold?: number) => boolean,
  testType: TestType
) {
  // 最低限のランドマークが検出されている場合のみ評価を実行
  if (isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) && 
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP)) {
    
    // 肩、腰、膝の中心点を計算
    const shoulderMid = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_SHOULDER],
      landmarks[LANDMARKS.RIGHT_SHOULDER]
    );
    
    const hipMid = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.RIGHT_HIP]
    );
    
    // 腰椎角度を計算
    const lumbarAngle = calculateFilteredLumbarAngle(shoulderMid, hipMid);
    
    // 1. 腰椎安定性スコア（ロックバック動作に適した評価）
    const lumbarDeviation = Math.abs(lumbarAngle);
    let lumbarStabilityScore = 0;
    
    // ロックバック動作では腰椎の適度な動きは正常
    if (lumbarDeviation <= 15) {
      lumbarStabilityScore = 100 - (lumbarDeviation * 1); // 15°まで1点ずつ減点
    } else if (lumbarDeviation <= 25) {
      lumbarStabilityScore = Math.max(0, 85 - ((lumbarDeviation - 15) * 3)); // 15°超えで3点ずつ減点
    } else if (lumbarDeviation <= 35) {
      lumbarStabilityScore = Math.max(0, 55 - ((lumbarDeviation - 25) * 2)); // 25°超えで2点ずつ減点
    } else {
      lumbarStabilityScore = Math.max(0, 35 - ((lumbarDeviation - 35) * 1)); // 35°超えで1点ずつ減点
    }
    
    let stabilityStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let stabilityDescription = 'リアルタイム腰椎安定性';
    
    if (lumbarStabilityScore >= 75) {
      stabilityStatus = 'normal';
      stabilityDescription = '良好な腰椎制御';
    } else if (lumbarStabilityScore >= 60) {
      stabilityStatus = 'caution';
      stabilityDescription = '軽度の腰椎制御低下';
    } else {
      stabilityStatus = 'abnormal';
      stabilityDescription = '腰椎制御に問題';
    }
    
    metrics.push({
      label: "腰椎安定性スコア",
      value: Number(lumbarStabilityScore.toFixed(1)),
      unit: "点",
      status: stabilityStatus,
      description: stabilityDescription,
      normalRange: "70-100点（良好な制御）"
    });
    
    // 2. 腰椎過剰運動量（安定性評価）
    // 中立位からの偏差を評価
    const neutralOffset = testType === 'rockBack' ? 12 : 8; // テスト別オフセット調整
    const adjustedMovement = Math.max(0, Math.abs(lumbarAngle) - neutralOffset);
    
    const excessiveStatus: 'normal' | 'caution' | 'abnormal' = 
      adjustedMovement < 8 ? 'normal' :
      adjustedMovement < 15 ? 'caution' : 'abnormal';
    
    const excessiveDescription = 
      adjustedMovement < 8 ? '適切な腰椎制御（安定性評価）' :
      adjustedMovement < 15 ? '軽度の過剰運動（安定性評価）' : '顕著な過剰運動（安定性評価）';
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(adjustedMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-10°（適切な制御）"
    });
    
    // 3. 腰椎屈曲・伸展角度（可動域評価）- 立位股関節屈曲テストのみ
    if (testType === 'standingHipFlex') {
      // 軽度の前傾が正常
      const flexionOffset = 5; // 立位股関節屈曲テスト用オフセット
      const correctedAngle = lumbarAngle - flexionOffset;
      let angleStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
      let angleDescription = '腰椎の前後屈角度（可動域評価）';
      
      if (Math.abs(correctedAngle) > 25) {
        angleStatus = 'abnormal';
        angleDescription = correctedAngle > 0 ? '過度な腰椎屈曲（前屈）- 可動域評価' : '過度な腰椎伸展（後屈）- 可動域評価';
      } else if (Math.abs(correctedAngle) > 15) {
        angleStatus = 'caution';
        angleDescription = correctedAngle > 0 ? '軽度の腰椎屈曲 - 可動域評価' : '軽度の腰椎伸展 - 可動域評価';
      } else {
        angleDescription = '良好な腰椎アライメント（可動域評価）';
      }
      
      metrics.push({
        label: "腰椎屈曲・伸展角度",
        value: Number(correctedAngle.toFixed(1)),
        unit: "°",
        status: angleStatus,
        description: angleDescription,
        normalRange: "-15° 〜 +15°（中立位）"
      });
    }
  }
}


/**
 * 立位股関節屈曲テストの評価指標を計算
 */
function calculateStandingHipFlexMetrics(
  _landmarks: any[], // 未使用パラメータをアンダースコア接頭辞で明示
  _metrics: Metric[], // 未使用パラメータをアンダースコア接頭辞で明示
  _isLandmarkVisible: (index: number, threshold?: number) => boolean, // 未使用パラメータをアンダースコア接頭辞で明示
  _getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number }, // 未使用パラメータをアンダースコア接頭辞で明示
  _movementHistory: any[] // 未使用パラメータをアンダースコア接頭辞で明示
) {
  // 立位股関節屈曲テストでは腰椎関連メトリクスのみを評価
  // これらは addLumbarFlexionExtensionMetric 関数で処理されます
}

/**
 * ロックバックテストの評価指標を計算
 */
function calculateRockBackMetrics(
  _landmarks: any[], // アンダースコア接頭辞で未使用パラメータを明示
  _metrics: Metric[], // 未使用パラメータをアンダースコア接頭辞で明示
  _isLandmarkVisible: (index: number, threshold?: number) => boolean, // 未使用パラメータをアンダースコア接頭辞で明示
  _getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number } // 未使用パラメータをアンダースコア接頭辞で明示
) {
  // ロックバックテストでは腰椎安定性スコア、腰椎過剰運動量、腰椎屈曲・伸展角度のみを評価
  // これらは addLumbarFlexionExtensionMetric 関数で処理されます
}

/**
 * 座位膝関節伸展テストの評価指標を計算
 */
function calculateSeatedKneeExtMetrics(
  landmarks: any[], // ランドマークデータ
  metrics: Metric[],
  isLandmarkVisible: (index: number, threshold?: number) => boolean,
  _getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number }, // 未使用パラメータ
  movementHistory: any[] // 膝伸展検出のために使用
) {
  // 必要なランドマークが検出されているかチェック（膝関節を含む）
  if (isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP) &&
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.LEFT_KNEE) &&
      isLandmarkVisible(LANDMARKS.RIGHT_KNEE)) {
    
    // 腰椎関連の計算
    const shoulderMidForLumbar = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_SHOULDER],
      landmarks[LANDMARKS.RIGHT_SHOULDER]
    );
    
    const hipMidForLumbar = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.RIGHT_HIP]
    );
    
    // 膝伸展動作の検出（膝角度変化を監視）
    const leftKneeAngle = calculateKneeAngle(landmarks);
    const isKneeExtending = detectKneeExtension(leftKneeAngle, movementHistory);
    
    // 通常の腰椎角度計算（反転計算用）
    const lumbarAngle = calculateFilteredLumbarAngle(shoulderMidForLumbar, hipMidForLumbar);
    
    // 1. 腰椎安定性スコア（座位膝関節伸展テスト用）
    const lumbarDeviation = Math.abs(lumbarAngle);
    let lumbarStabilityScore = 0;
    
    // 座位膝関節伸展テスト用の安定性評価（より厳しい基準）
    if (lumbarDeviation <= 8) {
      lumbarStabilityScore = 100 - (lumbarDeviation * 2.5); // 8°まで2.5点ずつ減点
    } else if (lumbarDeviation <= 15) {
      lumbarStabilityScore = Math.max(0, 80 - ((lumbarDeviation - 8) * 5)); // 8°超えで5点ずつ減点
    } else if (lumbarDeviation <= 25) {
      lumbarStabilityScore = Math.max(0, 45 - ((lumbarDeviation - 15) * 3)); // 15°超えで3点ずつ減点
    } else {
      lumbarStabilityScore = Math.max(0, 15 - ((lumbarDeviation - 25) * 1)); // 25°超えで1点ずつ減点
    }
    
    let stabilityStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let stabilityDescription = '座位膝伸展時の腰椎安定性';
    
    if (lumbarStabilityScore >= 80) {
      stabilityStatus = 'normal';
      stabilityDescription = '良好な腰椎安定性（座位膝伸展）';
    } else if (lumbarStabilityScore >= 60) {
      stabilityStatus = 'caution';
      stabilityDescription = '軽度の腰椎不安定性（座位膝伸展）';
    } else {
      stabilityStatus = 'abnormal';
      stabilityDescription = '顕著な腰椎不安定性（座位膝伸展）';
    }
    
    metrics.push({
      label: "腰椎安定性スコア",
      value: Number(lumbarStabilityScore.toFixed(1)),
      unit: "点",
      status: stabilityStatus,
      description: stabilityDescription,
      normalRange: "80-100点（良好な安定性）"
    });
    
    // 2. 腰椎過剰運動量（座位膝関節伸展テスト用 - 反転計算）
    // 膝伸展動作が検出された時のみ腰椎過剰運動量を計算
    let excessiveMovement = 0;
    
    if (isKneeExtending) {
      // 膝伸展中のみ腰椎過剰運動量を計算
      const baselineAngle = 20; // 安静時の基準角度
      
      if (lumbarAngle > 0) {
        // 前屈方向: より穏やかな反転効果で安静時数値を下げる
        excessiveMovement = Math.max(0, (baselineAngle - lumbarAngle) * 1.0);
      } else {
        // 後屈方向: より穏やかな反転効果
        excessiveMovement = Math.max(0, (baselineAngle - Math.abs(lumbarAngle)) * 0.5);
      }
      
      // 負の値は0にクリップ
      excessiveMovement = Math.max(0, excessiveMovement);
    } else {
      // 膝伸展していない時は過剰運動量を0に設定
      excessiveMovement = 0;
    }
    
    // 座位膝関節伸展テスト用の厳しい基準を維持（7°以上で厳格な評価）
    
    // ステータス判定は膝伸展動作と過剰運動量に基づく
    let excessiveStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let excessiveDescription = '座位膝伸展時の腰椎制御';
    
    if (!isKneeExtending) {
      // 膝伸展していない時は待機状態
      excessiveStatus = 'normal';
      excessiveDescription = '膝伸展動作を待機中（座位保持）';
    } else {
      // 膝伸展中の腰椎過剰運動量評価
      if (excessiveMovement <= 6) {
        excessiveStatus = 'normal';
        excessiveDescription = '良好な腰椎制御（膝伸展中）';
      } else if (excessiveMovement <= 10) {
        excessiveStatus = 'caution';
        excessiveDescription = '軽度の過剰運動（膝伸展中）';
      } else {
        excessiveStatus = 'abnormal';
        excessiveDescription = '顕著な過剰運動（膝伸展中）';
      }
    }
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(excessiveMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-6°（適切な制御）"
    });
  }
}

/**
 * 膝角度を計算する関数（座位膝関節伸展テスト用）
 */
function calculateKneeAngle(landmarks: any[]): number {
  try {
    // 左膝の角度を計算（左股関節-左膝-左足首の角度）
    const leftHip = landmarks[LANDMARKS.LEFT_HIP];
    const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
    const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
    
    if (!leftHip || !leftKnee || !leftAnkle) {
      return 180; // ランドマークが取得できない場合はまっすぐとみなす
    }
    
    // ベクトル計算
    const thighVector = {
      x: leftHip.x - leftKnee.x,
      y: leftHip.y - leftKnee.y,
      z: leftHip.z - leftKnee.z
    };
    
    const shinVector = {
      x: leftAnkle.x - leftKnee.x,
      y: leftAnkle.y - leftKnee.y,
      z: leftAnkle.z - leftKnee.z
    };
    
    // 内積と大きさの計算
    const dotProduct = thighVector.x * shinVector.x + thighVector.y * shinVector.y + thighVector.z * shinVector.z;
    const thighMagnitude = Math.sqrt(thighVector.x ** 2 + thighVector.y ** 2 + thighVector.z ** 2);
    const shinMagnitude = Math.sqrt(shinVector.x ** 2 + shinVector.y ** 2 + shinVector.z ** 2);
    
    // 角度の計算（ラジアンから度に変換）
    const cosAngle = dotProduct / (thighMagnitude * shinMagnitude);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    
    return angle;
  } catch (error) {
    console.warn('膝角度計算エラー:', error);
    return 180; // エラー時はまっすぐとみなす
  }
}

// 膝伸展状態のバッファリング用変数
let kneeExtensionStateBuffer: boolean[] = [];
let lastKneeExtensionState = false;

/**
 * 膝伸展動作を検出する関数（安定性向上）
 */
function detectKneeExtension(currentKneeAngle: number, movementHistory: any[]): boolean {
  try {
    // 履歴が少ない場合は膝伸展なしとみなす
    if (movementHistory.length < 3) {
      return false;
    }
    
    // 直近の膝角度履歴を取得（最大10フレーム）
    const recentHistory = movementHistory.slice(-10);
    const kneeAngles: number[] = [];
    
    // 過去の膝角度を計算
    for (const historyFrame of recentHistory) {
      if (historyFrame && Array.isArray(historyFrame)) {
        const angle = calculateKneeAngle(historyFrame);
        kneeAngles.push(angle);
      }
    }
    
    // 現在の角度も追加
    kneeAngles.push(currentKneeAngle);
    
    if (kneeAngles.length < 3) {
      return false;
    }
    
    // 膝伸展の検出条件（反応を向上）
    // 1. 現在の膝角度が150°以上（以前より低い闾値）
    // 2. 直近3フレームで角度が増加傾向（伸展方向）
    // 3. 角度が一定以上の動作をしている
    const recentAngles = kneeAngles.slice(-3);
    const isExtended = currentKneeAngle >= 150; // 150°に下げて反応向上
    const isExtending = recentAngles[2] > recentAngles[1] && recentAngles[1] > recentAngles[0];
    const hasSignificantMovement = Math.abs(recentAngles[2] - recentAngles[0]) > 3; // 3°以上の変化で反応向上
    const isPartiallyExtended = currentKneeAngle >= 140; // 部分的伸展も許可
    
    // 現在の判定結果
    const currentDetection = isExtended || (isPartiallyExtended && isExtending) || (isExtending && hasSignificantMovement);
    
    // 状態バッファに追加
    kneeExtensionStateBuffer.push(currentDetection);
    
    // バッファサイズを制限（最大15フレーム）
    if (kneeExtensionStateBuffer.length > 15) {
      kneeExtensionStateBuffer.shift();
    }
    
    // 安定性を高めるためのフィルタリング
    if (kneeExtensionStateBuffer.length >= 5) {
      const recentStates = kneeExtensionStateBuffer.slice(-5);
      const trueCount = recentStates.filter(state => state).length;
      
      // 直近5フレーム中3回以上検出されたら膝伸展中と判定
      const shouldBeExtending = trueCount >= 3;
      
      // 一度膝伸展が始まったら、明確に停止するまで継続
      if (shouldBeExtending) {
        lastKneeExtensionState = true;
      } else if (lastKneeExtensionState) {
        // 現在伸展中の場合、角度が大幅に下がったら停止
        const averageRecentAngle = recentAngles.reduce((a, b) => a + b, 0) / recentAngles.length;
        if (averageRecentAngle < 130) { // 130°以下になったら停止
          lastKneeExtensionState = false;
        }
      }
      
      return lastKneeExtensionState;
    }
    
    return currentDetection;
  } catch (error) {
    console.warn('膝伸展検出エラー:', error);
    return false;
  }
}
