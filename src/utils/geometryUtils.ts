import type { NormalizedLandmark } from "../types";

/**
 * ラジアンから度に変換
 */
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * 2点間のベクトルを計算
 */
export const calculateVector = (pointA: NormalizedLandmark, pointB: NormalizedLandmark) => ({
  x: pointB.x - pointA.x,
  y: pointB.y - pointA.y,
  z: pointB.z - pointA.z
});

/**
 * ベクトルの大きさを計算
 */
export const calculateMagnitude = (vector: { x: number; y: number; z: number }) =>
  Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);

/**
 * 2つのベクトル間の角度を計算（3D）
 */
export const calculateAngleBetweenVectors = (v1: any, v2: any) => {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = calculateMagnitude(v1);
  const mag2 = calculateMagnitude(v2);
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 + 1e-6))));
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
  // 体幹ベクトル（腰から肩へ）
  const torsoVector = calculateVector(hipMid, shoulderMid);
  
  // Y-Z平面での2D角度計算（側面からの角度）
  const torsoVector2D = { x: torsoVector.z, y: torsoVector.y };
  const referenceVector2D = { x: 0, y: -1 };
  
  // 2Dでの角度計算
  const dot = torsoVector2D.x * referenceVector2D.x + torsoVector2D.y * referenceVector2D.y;
  const cross = torsoVector2D.x * referenceVector2D.y - torsoVector2D.y * referenceVector2D.x;
  const angle = Math.atan2(cross, dot);
  const angleInDegrees = radToDeg(angle);
  
  // 骨盤前傾補正: 骨盤が前傾している場合は腰椎伸展として検出される
  // Z軸の正の方向（前方）への移動を屈曲、負の方向（後方）を伸展とする
  let correctedAngle = angleInDegrees;
  
  // 骨盤前傾の影響を考慮した補正（腰部の前後位置関係から判定）
  if (torsoVector.z > 0.1) {
    // 明らかに前屈している場合
    correctedAngle = Math.abs(angleInDegrees);
  } else if (torsoVector.z < -0.05) {
    // 骨盤前傾による腰椎伸展の可能性
    correctedAngle = -Math.abs(angleInDegrees);
  }
  
  // 胸腰椎一括測定に合わせたスケーリング調整
  const scaledAngle = correctedAngle * 0.8; // 骨盤前傾補正を含むスケーリング
  
  return scaledAngle;
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
