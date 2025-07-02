import { useState, useEffect } from 'react';
import type { Metric, PoseLandmarkerResult, TestType } from '../types';
import { LANDMARKS } from '../types';
import {
  radToDeg,
  calculate2DAngle,
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
          normalRange: "80-100点（優秀な制御）"
        },
        {
          label: "腰椎過剰運動量",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "0-5°（良好な制御）"
        }
      );
      
      // 座位膝関節伸展テスト以外は腰椎屈曲・伸展角度も含める
      if (testType !== 'seatedKneeExt') {
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
        waitingMetrics.push({
          label: "股関節屈曲角度",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "0-90°"
        });
      } else if (testType === 'rockBack') {
        waitingMetrics.push({
          label: "股関節-膝関節角度",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "110-140°"
        });
      } else if (testType === 'seatedKneeExt') {
        waitingMetrics.push(
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
          addLumbarFlexionExtensionMetric(landmarks, calculatedMetrics, isLandmarkVisible);
          calculateStandingHipFlexMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint, movementHistory);
          break;
        case "rockBack":
          // ロックバックテスト：腰椎過剰運動量を含める
          addLumbarFlexionExtensionMetric(landmarks, calculatedMetrics, isLandmarkVisible);
          calculateRockBackMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint);
          break;
        case "seatedKneeExt":
          // 座位膝関節伸展テスト：腰椎安定性スコアと腰椎過剰運動量のみ
          addLumbarMetricsForSeatedTest(landmarks, calculatedMetrics, isLandmarkVisible);
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
      // 0-5°が100点、それを超えると減点
      normalizedScore = Math.max(0, 100 - (metric.value * 20));
    } else if (metric.label === "腰椎屈曲・伸展角度") {
      // -15°〜+15°の範囲で100点、それを超えると減点
      const deviation = Math.abs(metric.value);
      normalizedScore = Math.max(0, 100 - (Math.max(0, deviation - 15) * 5));
    } else if (metric.label === "股関節屈曲角度") {
      // 0-90°の範囲で評価、90°で100点
      if (metric.value <= 90) {
        normalizedScore = 100;
      } else if (metric.value <= 120) {
        normalizedScore = 100 - ((metric.value - 90) * 2); // 90°超えで減点
      } else {
        normalizedScore = Math.max(0, 40 - ((metric.value - 120) * 2)); // 120°超えでさらに減点
      }
    } else if (metric.label === "股関節-膝関節角度") {
      // 110-140°の範囲で100点
      if (metric.value >= 110 && metric.value <= 140) {
        normalizedScore = 100;
      } else if (metric.value >= 90) {
        normalizedScore = Math.max(0, 100 - Math.abs(metric.value - 125) * 2);
      } else {
        normalizedScore = Math.max(0, 40 - ((90 - metric.value) * 2));
      }
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
  isLandmarkVisible: (index: number, threshold?: number) => boolean
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
    
    // 1. 腰椎安定性スコア（シンプルな評価）
    const lumbarStabilityScore = Math.max(0, 100 - Math.abs(lumbarAngle) * 3);
    let stabilityStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let stabilityDescription = 'リアルタイム腰椎安定性';
    
    if (lumbarStabilityScore >= 80) {
      stabilityStatus = 'normal';
      stabilityDescription = '優秀な腰椎制御';
    } else if (lumbarStabilityScore >= 60) {
      stabilityStatus = 'caution';
      stabilityDescription = '軽度の腰椎不安定性';
    } else {
      stabilityStatus = 'abnormal';
      stabilityDescription = '腰椎制御不良';
    }
    
    metrics.push({
      label: "腰椎安定性スコア",
      value: Number(lumbarStabilityScore.toFixed(1)),
      unit: "点",
      status: stabilityStatus,
      description: stabilityDescription,
      normalRange: "80-100点（優秀な制御）"
    });
    
    // 2. 腰椎過剰運動量（現在の角度の絶対値）
    const excessiveMovement = Math.abs(lumbarAngle);
    const excessiveStatus: 'normal' | 'caution' | 'abnormal' = 
      excessiveMovement < 5 ? 'normal' :
      excessiveMovement < 10 ? 'caution' : 'abnormal';
    
    const excessiveDescription = 
      excessiveMovement < 5 ? '最小限の過剰運動' :
      excessiveMovement < 10 ? '軽度の過剰運動' : '顕著な過剰運動';
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(excessiveMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-5°（良好な制御）"
    });
    
    // 3. 腰椎屈曲・伸展角度
    let angleStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let angleDescription = '腰椎の前後屈角度';
    
    if (Math.abs(lumbarAngle) > 30) {
      angleStatus = 'abnormal';
      angleDescription = lumbarAngle > 0 ? '過度な腰椎屈曲（前屈）' : '過度な腰椎伸展（後屈）';
    } else if (Math.abs(lumbarAngle) > 15) {
      angleStatus = 'caution';
      angleDescription = lumbarAngle > 0 ? '軽度の腰椎屈曲' : '軽度の腰椎伸展';
    } else {
      angleDescription = '良好な腰椎アライメント';
    }
    
    metrics.push({
      label: "腰椎屈曲・伸展角度",
      value: Number(lumbarAngle.toFixed(1)),
      unit: "°",
      status: angleStatus,
      description: angleDescription,
      normalRange: "-15° 〜 +15°（中立位）"
    });
  }
}

/**
 * 座位膝関節伸展テスト用の腰椎メトリクス（腰椎屈曲・伸展角度を除外）
 */
function addLumbarMetricsForSeatedTest(
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
    
    // 1. 腰椎安定性スコア（シンプルな評価）
    const lumbarStabilityScore = Math.max(0, 100 - Math.abs(lumbarAngle) * 3);
    let stabilityStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let stabilityDescription = 'リアルタイム腰椎安定性';
    
    if (lumbarStabilityScore >= 80) {
      stabilityStatus = 'normal';
      stabilityDescription = '優秀な腰椎制御';
    } else if (lumbarStabilityScore >= 60) {
      stabilityStatus = 'caution';
      stabilityDescription = '軽度の腰椎不安定性';
    } else {
      stabilityStatus = 'abnormal';
      stabilityDescription = '腰椎制御不良';
    }
    
    metrics.push({
      label: "腰椎安定性スコア",
      value: Number(lumbarStabilityScore.toFixed(1)),
      unit: "点",
      status: stabilityStatus,
      description: stabilityDescription,
      normalRange: "80-100点（優秀な制御）"
    });
    
    // 2. 腰椎過剰運動量（現在の角度の絶対値）
    const excessiveMovement = Math.abs(lumbarAngle);
    const excessiveStatus: 'normal' | 'caution' | 'abnormal' = 
      excessiveMovement < 5 ? 'normal' :
      excessiveMovement < 10 ? 'caution' : 'abnormal';
    
    const excessiveDescription = 
      excessiveMovement < 5 ? '最小限の過剰運動' :
      excessiveMovement < 10 ? '軽度の過剰運動' : '顕著な過剰運動';
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(excessiveMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-5°（良好な制御）"
    });
    
    // 腰椎屈曲・伸展角度は座位膝関節伸展テストでは除外
  }
}

/**
 * 立位股関節屈曲テストの評価指標を計算
 */
function calculateStandingHipFlexMetrics(
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
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER)) {
    
    // 股関節屈曲角度計算
    const hipMid = getMidpoint(LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP);
    const kneeMid = getMidpoint(LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE);
    
    // 股関節角度（大腿部と垂直線の角度）
    const thighVector = calculateVector(hipMid, kneeMid);
    const verticalVector = { x: 0, y: 1, z: 0 };
    const hipFlexAngle = radToDeg(calculateAngleBetweenVectors(thighVector, verticalVector));
    
    let hipStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    if (hipFlexAngle > 120) hipStatus = 'abnormal';
    else if (hipFlexAngle > 90) hipStatus = 'caution';
    
    metrics.push({
      label: "股関節屈曲角度",
      value: Number(hipFlexAngle.toFixed(1)),
      unit: "°",
      status: hipStatus,
      description: "股関節の屈曲角度を測定",
      normalRange: "0-90°"
    });

    // 股関節-腰椎リズム（削除済み）

    // 動作速度（削除済み）
  }
}

/**
 * ロックバックテストの評価指標を計算
 */
function calculateRockBackMetrics(
  _landmarks: any[], // アンダースコア接頭辞で未使用パラメータを明示
  metrics: Metric[],
  isLandmarkVisible: (index: number, threshold?: number) => boolean,
  getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number }
) {
  if (isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP) &&
      isLandmarkVisible(LANDMARKS.LEFT_KNEE) && 
      isLandmarkVisible(LANDMARKS.RIGHT_KNEE) &&
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.LEFT_ANKLE) &&
      isLandmarkVisible(LANDMARKS.RIGHT_ANKLE)) {
    
    const hipMid = getMidpoint(LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP);
    const kneeMid = getMidpoint(LANDMARKS.LEFT_KNEE, LANDMARKS.RIGHT_KNEE);
    const ankleMid = getMidpoint(LANDMARKS.LEFT_ANKLE, LANDMARKS.RIGHT_ANKLE);
    
    // 股関節-膝関節角度（後方姿勢角度）
    const hipKneeAngle = radToDeg(calculate2DAngle(
      { x: ankleMid.x, y: ankleMid.y },
      { x: kneeMid.x, y: kneeMid.y },
      { x: hipMid.x, y: hipMid.y }
    ));
    
    metrics.push({
      label: "股関節-膝関節角度",
      value: Number(hipKneeAngle.toFixed(1)),
      unit: "°",
      status: hipKneeAngle < 90 ? 'abnormal' : hipKneeAngle < 110 ? 'caution' : 'normal',
      description: "後方への体重移動時の下肢角度",
      normalRange: "110-140°"
    });

    // 体幹安定性（削除済み）

    // 腰椎カーブの維持（削除済み）
    // 骨盤制御（削除済み）
  }
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
