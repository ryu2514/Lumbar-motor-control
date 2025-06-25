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
 * 腰椎屈曲・伸展角度を計算（日本整形外科学会基準対応）
 * @param shoulderMid 肩の中心点
 * @param hipMid 腰の中心点  
 * @returns 腰椎角度（度）- 正の値: 屈曲（前屈）、負の値: 伸展（後屈）
 * 日本整形外科学会基準: 腰椎屈曲45°/伸展30°
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
  
  // 日本整形外科学会基準に合わせたスケーリング調整
  // 計算された角度を実際の腰椎可動域にマッピング
  // 前屈（正の値）: 0°～45°、後屈（負の値）: 0°～-30°
  const scaledAngle = angleInDegrees * 0.75; // スケーリング係数で調整
  
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
