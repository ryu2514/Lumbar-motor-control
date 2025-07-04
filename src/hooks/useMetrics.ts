import { useState, useEffect } from 'react';
import type { Metric, PoseLandmarkerResult, TestType } from '../types';
import { LANDMARKS } from '../types';
import {
  radToDeg,
  calculateAngleBetweenVectors,
  calculateVector,
  calculateFilteredLumbarAngle,
  calculateMidpoint,
  resetAngleFilter
} from '../utils/geometryUtils';

/**
 * ポーズランドマークから評価指標を計算するカスタムフック
 */
export const useMetrics = (result: PoseLandmarkerResult | null, testType: TestType): Metric[] => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [movementHistory, setMovementHistory] = useState<any[]>([]);
  const [previousTestType, setPreviousTestType] = useState<TestType | null>(null);

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
            label: "座位腰椎制御スコア",
            value: 0,
            unit: "点",
            status: 'caution',
            description: '姿勢データを取得中...',
            normalRange: "70-100点（良好な制御）"
          },
          {
            label: "腰椎アライメント",
            value: 0,
            unit: "°",
            status: 'caution',
            description: '姿勢データを取得中...',
            normalRange: "0-15°"
          }
        );
      }
      
      setMetrics(waitingMetrics);
      return;
    }

    const landmarks = result.worldLandmarks[0];
    const calculatedMetrics: Metric[] = [];

    // 動作履歴を保存（タイミング分析用）
    setMovementHistory(prev => [...prev.slice(-19), landmarks]); // 直近20フレームを維持

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
          // 座位膝関節伸展テスト：シンプルな腰椎制御評価
          addSeatedLumbarControlMetric(landmarks, calculatedMetrics, isLandmarkVisible);
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

    setMetrics(calculatedMetrics);
  }, [result, testType, movementHistory]);

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
      // ロックバック動作では調整された過剰運動量を評価
      // 0-8°が100点、8-15°で段階的減点、15-25°で更に減点
      if (metric.value <= 8) {
        normalizedScore = 100;
      } else if (metric.value <= 15) {
        normalizedScore = 100 - ((metric.value - 8) * 6); // 8°超えで6点ずつ減点
      } else if (metric.value <= 25) {
        normalizedScore = Math.max(0, 58 - ((metric.value - 15) * 3)); // 15°超えで3点ずつ減点
      } else {
        normalizedScore = Math.max(0, 28 - ((metric.value - 25) * 1)); // 25°超えで1点ずつ減点
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
 * 座位膝関節伸展テスト用のシンプルな腰椎制御評価
 */
function addSeatedLumbarControlMetric(
  landmarks: Array<{x: number, y: number, z: number}>,
  metrics: Metric[],
  isLandmarkVisible: (index: number) => boolean
) {
  // 必要なランドマークが見える場合のみ処理
  if (isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) && 
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP)) {
    
    // 肩、腰の中心点を計算
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
    
    // 座位腰椎制御スコア（総合的な評価）
    const excessiveMovement = Math.abs(lumbarAngle);
    
    // デバッグログ（座位膝伸展テスト）
    console.log('🦵 座位膝伸展テスト - 腰椎角度:', {
      生角度: lumbarAngle.toFixed(2) + '°',
      絶対値: excessiveMovement.toFixed(2) + '°',
      肩座標: shoulderMid,
      腰座標: hipMid
    });
    
    // より厳密な評価基準（座位膝伸展テスト用）
    let controlScore = 0;
    if (excessiveMovement <= 1) {
      controlScore = 100; // 完璧な制御
    } else if (excessiveMovement <= 3) {
      controlScore = 100 - ((excessiveMovement - 1) * 10); // 1°超えで10点ずつ減点
    } else if (excessiveMovement <= 5) {
      controlScore = 80 - ((excessiveMovement - 3) * 15); // 3°超えで15点ずつ減点
    } else if (excessiveMovement <= 10) {
      controlScore = Math.max(0, 50 - ((excessiveMovement - 5) * 8)); // 5°超えで8点ずつ減点
    } else {
      controlScore = Math.max(0, 10 - ((excessiveMovement - 10) * 1)); // 10°超えで1点ずつ減点
    }
    
    let status: 'normal' | 'caution' | 'abnormal' = 'normal';
    let description = '座位膝伸展時の腰椎制御';
    
    if (controlScore >= 70) {
      status = 'normal';
      description = '良好な腰椎制御';
    } else if (controlScore >= 50) {
      status = 'caution';
      description = '腰椎制御にやや課題';
    } else {
      status = 'abnormal';
      description = '腰椎制御に問題';
    }
    
    metrics.push({
      label: "座位腰椎制御スコア",
      value: Number(controlScore.toFixed(1)),
      unit: "点",
      status: status,
      description: description,
      normalRange: "70-100点（良好な制御）"
    });
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
  _landmarks: any[], // 未使用パラメータをアンダースコア接頭辞で明示
  metrics: Metric[],
  isLandmarkVisible: (index: number, threshold?: number) => boolean,
  getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number },
  _movementHistory: any[] // 未使用パラメータをアンダースコア接頭辞で明示
) {
  if (isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP) &&
      isLandmarkVisible(LANDMARKS.LEFT_KNEE) && 
      isLandmarkVisible(LANDMARKS.RIGHT_KNEE) &&
      isLandmarkVisible(LANDMARKS.LEFT_ANKLE) &&
      isLandmarkVisible(LANDMARKS.RIGHT_ANKLE) &&
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER)) {
    
    // 中点を計算
    const hipMid = getMidpoint(LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP);
    const shoulderMid = getMidpoint(LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER);
    
    // 骨盤安定性（削除済み）

    // 腰椎のアライメント維持
    const trunkVector = calculateVector(hipMid, shoulderMid);
    const verticalRef = { x: 0, y: -1, z: 0 };
    const lumbarAngle = radToDeg(calculateAngleBetweenVectors(trunkVector, verticalRef));
    
    metrics.push({
      label: "腰椎アライメント",
      value: Number(lumbarAngle.toFixed(1)),
      unit: "°",
      status: lumbarAngle > 30 ? 'abnormal' : lumbarAngle > 15 ? 'caution' : 'normal',
      description: "膝伸展時の腰椎前弯維持",
      normalRange: "0-15°"
    });

    // 左右対称性（削除済み）

    // 代償動作（削除済み）
  }
}
