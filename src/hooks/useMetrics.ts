import { useState, useEffect } from 'react';
import type { Metric, PoseLandmarkerResult, TestType } from '../types';
import { LANDMARKS } from '../types';
import {
  radToDeg,
  calculate2DAngle,
  calculateAngleBetweenVectors,
  calculateMagnitude,
  calculateVector,
  calculateFilteredLumbarAngle,
  calculateMidpoint,
  resetAngleFilter,
  calculateHipAngle,
  addStabilityDataPoint,
  analyzeLumbarStability
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
      const waitingMetrics: Metric[] = [
        {
          label: "腰椎安定性スコア",
          value: 0,
          unit: "点",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "80-100点（優秀な制御）"
        },
        {
          label: "股関節-腰椎運動比率",
          value: 0,
          unit: "比率",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "0.1-0.3（理想的な分離）"
        },
        {
          label: "腰椎過剰運動量",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "0-5°（良好な制御）"
        },
        {
          label: "現在の腰椎角度",
          value: 0,
          unit: "°",
          status: 'caution',
          description: '姿勢データを取得中...',
          normalRange: "-15° 〜 +15°（中立位）"
        }
      ];
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
      // 全テストで腰椎屈曲・伸展角度を計算
      addLumbarFlexionExtensionMetric(landmarks, calculatedMetrics, isLandmarkVisible);
      
      // 各テスト種類に応じた評価指標を計算
      switch (testType) {
        case "standingHipFlex":
          calculateStandingHipFlexMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint, movementHistory);
          break;
        case "rockBack":
          calculateRockBackMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint);
          break;
        case "seatedKneeExt":
          calculateSeatedKneeExtMetrics(landmarks, calculatedMetrics, isLandmarkVisible, getMidpoint, movementHistory);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error("Metrics calculation error:", error);
    }

    setMetrics(calculatedMetrics);
  }, [result, testType, movementHistory]);

  return metrics;
};

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
    
    // 膝のランドマークが利用可能な場合のみ股関節角度を計算
    let hipAngle = 0;
    if (isLandmarkVisible(LANDMARKS.LEFT_KNEE) && isLandmarkVisible(LANDMARKS.RIGHT_KNEE)) {
      const kneeMid = calculateMidpoint(
        landmarks[LANDMARKS.LEFT_KNEE],
        landmarks[LANDMARKS.RIGHT_KNEE]
      );
      hipAngle = calculateHipAngle(shoulderMid, hipMid, kneeMid);
    }
    
    // 動的安定性解析にデータを追加
    const timestamp = Date.now();
    addStabilityDataPoint(lumbarAngle, hipAngle, timestamp);
    
    // 動的安定性を解析
    const stabilityAnalysis = analyzeLumbarStability();
    
    // 1. 腰椎安定性スコア
    let stabilityStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let stabilityDescription = '股関節運動中の腰椎安定性';
    
    if (stabilityAnalysis.stabilityGrade === 'excellent') {
      stabilityStatus = 'normal';
      stabilityDescription = '優秀な腰椎安定性';
    } else if (stabilityAnalysis.stabilityGrade === 'good') {
      stabilityStatus = 'normal';
      stabilityDescription = '良好な腰椎安定性';
    } else if (stabilityAnalysis.stabilityGrade === 'fair') {
      stabilityStatus = 'caution';
      stabilityDescription = '軽度の腰椎不安定性';
    } else {
      stabilityStatus = 'abnormal';
      stabilityDescription = '腰椎制御不良';
    }
    
    metrics.push({
      label: "腰椎安定性スコア",
      value: Number(stabilityAnalysis.lumbarStabilityScore.toFixed(1)),
      unit: "点",
      status: stabilityStatus,
      description: stabilityDescription,
      normalRange: "80-100点（優秀な制御）"
    });
    
    // 2. 股関節-腰椎運動比率
    const ratioStatus: 'normal' | 'caution' | 'abnormal' = 
      stabilityAnalysis.hipLumbarRatio < 0.3 ? 'normal' :
      stabilityAnalysis.hipLumbarRatio < 0.5 ? 'caution' : 'abnormal';
    
    const ratioDescription = 
      stabilityAnalysis.hipLumbarRatio < 0.3 ? '理想的な運動分離' :
      stabilityAnalysis.hipLumbarRatio < 0.5 ? '軽度の代償動作' : '過剰な腰椎代償';
    
    metrics.push({
      label: "股関節-腰椎運動比率",
      value: Number(stabilityAnalysis.hipLumbarRatio.toFixed(2)),
      unit: "比率",
      status: ratioStatus,
      description: ratioDescription,
      normalRange: "0.1-0.3（理想的な分離）"
    });
    
    // 3. 腰椎過剰運動量
    const excessiveStatus: 'normal' | 'caution' | 'abnormal' = 
      stabilityAnalysis.lumbarExcessiveMovement < 5 ? 'normal' :
      stabilityAnalysis.lumbarExcessiveMovement < 10 ? 'caution' : 'abnormal';
    
    const excessiveDescription = 
      stabilityAnalysis.lumbarExcessiveMovement < 5 ? '最小限の過剰運動' :
      stabilityAnalysis.lumbarExcessiveMovement < 10 ? '軽度の過剰運動' : '顕著な過剰運動';
    
    metrics.push({
      label: "腰椎過剰運動量",
      value: Number(stabilityAnalysis.lumbarExcessiveMovement.toFixed(1)),
      unit: "°",
      status: excessiveStatus,
      description: excessiveDescription,
      normalRange: "0-5°（良好な制御）"
    });
    
    // 4. 現在の腰椎角度（参考値）
    let angleStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    let angleDescription = '現在の腰椎角度';
    
    if (Math.abs(lumbarAngle) > 30) {
      angleStatus = 'abnormal';
      angleDescription = lumbarAngle > 0 ? '過度な腰椎屈曲' : '過度な腰椎伸展';
    } else if (Math.abs(lumbarAngle) > 15) {
      angleStatus = 'caution';
      angleDescription = lumbarAngle > 0 ? '軽度の腰椎屈曲' : '軽度の腰椎伸展';
    } else {
      angleDescription = '良好な腰椎アライメント';
    }
    
    metrics.push({
      label: "現在の腰椎角度",
      value: Number(lumbarAngle.toFixed(1)),
      unit: "°",
      status: angleStatus,
      description: angleDescription,
      normalRange: "-15° 〜 +15°（中立位）"
    });
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
  movementHistory: any[]
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

    // 既存の腰椎角度計算は共通関数に移行済みのため削除

    // 股関節-腰椎リズム（比率分析）
    // 腰椎角度は共通関数で計算されるため、ここでは股関節角度のみ使用
    const hipLumbarRatio = hipFlexAngle > 30 ? Math.min(30, hipFlexAngle) / hipFlexAngle : 0;
    let rhythmStatus: 'normal' | 'caution' | 'abnormal' = 'normal';
    if (hipLumbarRatio > 0.7) rhythmStatus = 'abnormal';
    else if (hipLumbarRatio > 0.5) rhythmStatus = 'caution';
    
    metrics.push({
      label: "股関節-腰椎リズム",
      value: Number(hipLumbarRatio.toFixed(2)),
      unit: "比率",
      status: rhythmStatus,
      description: "股関節と腰椎の動作協調性",
      normalRange: "0.2-0.5"
    });

    // 動作タイミング分析
    if (movementHistory.length > 10) {
      const initialHip = movementHistory[0] ? getMidpoint(LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP) : hipMid;
      const currentMovement = Math.abs(hipMid.y - initialHip.y);
      const movementSpeed = currentMovement * 100; // 正規化された速度
      
      metrics.push({
        label: "動作速度",
        value: Number(movementSpeed.toFixed(1)),
        unit: "mm/frame",
        status: movementSpeed > 5 ? 'abnormal' : movementSpeed > 3 ? 'caution' : 'normal',
        description: "前屈動作の制御された速度",
        normalRange: "0-3 mm/frame"
      });
    }
  }
}

/**
 * ロックバックテストの評価指標を計算
 */
function calculateRockBackMetrics(
  landmarks: any[], // この関数内でこのパラメータは使用されています
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
    const shoulderMid = getMidpoint(LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER);
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

    // 体幹の安定性（ロックバック時）
    const trunkVector = calculateVector(hipMid, shoulderMid);
    const horizontalRef = { x: 1, y: 0, z: 0 };
    const trunkDeviation = radToDeg(calculateAngleBetweenVectors(trunkVector, horizontalRef));
    
    metrics.push({
      label: "体幹安定性",
      value: Number(Math.abs(90 - trunkDeviation).toFixed(1)),
      unit: "°",
      status: Math.abs(90 - trunkDeviation) > 20 ? 'abnormal' : Math.abs(90 - trunkDeviation) > 10 ? 'caution' : 'normal',
      description: "後方移動時の体幹の安定性",
      normalRange: "0-10°"
    });

    // 腰椎カーブの維持
    const spineLength = calculateMagnitude(trunkVector);
    const lumbarControl = spineLength > 0.1 ? 'normal' : spineLength > 0.05 ? 'caution' : 'abnormal';
    
    metrics.push({
      label: "腰椎カーブ維持",
      value: Number((spineLength * 100).toFixed(1)),
      unit: "cm",
      status: lumbarControl,
      description: "後方移動時の腰椎生理的カーブ",
      normalRange: ">10cm"
    });

    // 骨盤制御
    const pelvicVector = calculateVector(landmarks[LANDMARKS.RIGHT_HIP], landmarks[LANDMARKS.LEFT_HIP]);
    const pelvicTilt = radToDeg(Math.atan2(pelvicVector.y, Math.abs(pelvicVector.x)));
    
    metrics.push({
      label: "骨盤制御",
      value: Number(Math.abs(pelvicTilt).toFixed(1)),
      unit: "°",
      status: Math.abs(pelvicTilt) > 15 ? 'abnormal' : Math.abs(pelvicTilt) > 8 ? 'caution' : 'normal',
      description: "後方移動時の骨盤安定性",
      normalRange: "0-8°"
    });
  }
}

/**
 * 座位膝関節伸展テストの評価指標を計算
 */
function calculateSeatedKneeExtMetrics(
  landmarks: any[],
  metrics: Metric[],
  isLandmarkVisible: (index: number, threshold?: number) => boolean,
  getMidpoint: (index1: number, index2: number) => { x: number; y: number; z: number },
  movementHistory: any[]
) {
  if (isLandmarkVisible(LANDMARKS.LEFT_HIP) && 
      isLandmarkVisible(LANDMARKS.RIGHT_HIP) &&
      isLandmarkVisible(LANDMARKS.LEFT_KNEE) && 
      isLandmarkVisible(LANDMARKS.RIGHT_KNEE) &&
      isLandmarkVisible(LANDMARKS.LEFT_ANKLE) &&
      isLandmarkVisible(LANDMARKS.RIGHT_ANKLE) &&
      isLandmarkVisible(LANDMARKS.LEFT_SHOULDER) &&
      isLandmarkVisible(LANDMARKS.RIGHT_SHOULDER)) {
    
    // 膝関節伸展角度
    const leftKneeAngle = radToDeg(calculate2DAngle(
      landmarks[LANDMARKS.LEFT_HIP],
      landmarks[LANDMARKS.LEFT_KNEE],
      landmarks[LANDMARKS.LEFT_ANKLE]
    ));
    
    const rightKneeAngle = radToDeg(calculate2DAngle(
      landmarks[LANDMARKS.RIGHT_HIP],
      landmarks[LANDMARKS.RIGHT_KNEE],
      landmarks[LANDMARKS.RIGHT_ANKLE]
    ));
    
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    
    metrics.push({
      label: "膝関節伸展角度",
      value: Number(avgKneeAngle.toFixed(1)),
      unit: "°",
      status: avgKneeAngle < 160 ? 'abnormal' : avgKneeAngle < 170 ? 'caution' : 'normal',
      description: "座位での膝関節伸展可動域",
      normalRange: "170-180°"
    });

    // 骨盤の安定性
    const hipMid = getMidpoint(LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP);
    const shoulderMid = getMidpoint(LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER);
    const pelvicVector = calculateVector(landmarks[LANDMARKS.RIGHT_HIP], landmarks[LANDMARKS.LEFT_HIP]);
    
    // 骨盤傾斜の分析
    const pelvicTilt = radToDeg(Math.atan2(pelvicVector.y, Math.abs(pelvicVector.x)));
    
    metrics.push({
      label: "骨盤安定性",
      value: Number(Math.abs(pelvicTilt).toFixed(1)),
      unit: "°",
      status: Math.abs(pelvicTilt) > 12 ? 'abnormal' : Math.abs(pelvicTilt) > 6 ? 'caution' : 'normal',
      description: "膝伸展時の骨盤後傾制御",
      normalRange: "0-6°"
    });

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

    // 左右対称性
    const kneeSymmetry = Math.abs(leftKneeAngle - rightKneeAngle);
    
    metrics.push({
      label: "左右対称性",
      value: Number(kneeSymmetry.toFixed(1)),
      unit: "°",
      status: kneeSymmetry > 15 ? 'abnormal' : kneeSymmetry > 8 ? 'caution' : 'normal',
      description: "左右膝関節の対称的な動き",
      normalRange: "0-8°"
    });

    // 代償動作
    if (movementHistory.length > 5) {
      const initialTrunk = movementHistory[0] ? getMidpoint(LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER) : shoulderMid;
      const trunkCompensation = Math.abs(shoulderMid.y - initialTrunk.y) * 100;
      
      metrics.push({
        label: "代償動作",
        value: Number(trunkCompensation.toFixed(1)),
        unit: "mm",
        status: trunkCompensation > 30 ? 'abnormal' : trunkCompensation > 15 ? 'caution' : 'normal',
        description: "膝伸展時の体幹代償動作",
        normalRange: "0-15mm"
      });
    }
  }
}
