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
  _movementHistory: any[] // 未使用パラメータをアンダースコア接頭辞で明示
) {
  if (isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP) &&
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER)) {
    
    // 腰椎関連の計算
    const shoulderMidForLumbar = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_SHOULDER],
      landmarks[LANDMARKS.RIGHT_SHOULDER]
    );
    
    const hipMidForLumbar = calculateMidpoint(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.RIGHT_HIP]
    );
    
    const lumbarAngle = calculateFilteredLumbarAngle(shoulderMidForLumbar, hipMidForLumbar);
    
    // 1. 腰椎安定性スコア（座位膝関節伸展テスト用）
    const lumbarDeviation = Math.abs(lumbarAngle);
    let lumbarStabilityScore = 0;
    
    // 座位膝関節伸展テスト用の安定性評価（より厳しい基準）
    if (lumbarDeviation <= 10) {
      lumbarStabilityScore = 100 - (lumbarDeviation * 2); // 10°まで2点ずつ減点
    } else if (lumbarDeviation <= 20) {
      lumbarStabilityScore = Math.max(0, 80 - ((lumbarDeviation - 10) * 4)); // 10°超えで4点ずつ減点
    } else if (lumbarDeviation <= 30) {
      lumbarStabilityScore = Math.max(0, 40 - ((lumbarDeviation - 20) * 2)); // 20°超えで2点ずつ減点
    } else {
      lumbarStabilityScore = Math.max(0, 20 - ((lumbarDeviation - 30) * 1)); // 30°超えで1点ずつ減点
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
    
    // 2. 腰椎過剰運動量（座位膝関節伸展テスト用 - 屈曲専用検出）
    // 座位膝関節伸展では腰椎の屈曲（前屈）のみが問題
    // 垂直に近い状態（lumbarAngle ≈ 0）では低い値、屈曲時に高い値
    let excessiveMovement = 0;
    if (lumbarAngle > 3) {
      // 3°以上の前屈のみを検出（より厳格な閾値で良い姿勢を保護）
      excessiveMovement = (lumbarAngle - 3) * 3.5;
    } else {
      // 良い姿勢の範囲を拡大（0-3°）
      excessiveMovement = 0;
    }
    
    // 座位膝関節伸展テスト用の厳しい基準を維持（7°以上で厳格な評価）
    
    // ステータス判定は角度ベース（厳格な基準を内部計算で維持）
    let excessiveStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let excessiveDescription = '座位膝伸展時の腰椎制御';
    
    if (excessiveMovement <= 5) {
      excessiveStatus = 'normal';
      excessiveDescription = '良好な腰椎制御（座位膝伸展）';
    } else if (excessiveMovement <= 10) {
      excessiveStatus = 'caution';
      excessiveDescription = '軽度の過剰運動（座位膝伸展）';
    } else {
      excessiveStatus = 'abnormal';
      excessiveDescription = '顕著な過剰運動（座位膝伸展）';
    }
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(excessiveMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-5°（適切な制御）"
    });
  }
}
