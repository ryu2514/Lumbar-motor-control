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
 * 腰椎屈曲・伸展角度を計算
 * @param shoulderMid 肩の中心点
 * @param hipMid 腰の中心点  
 * @returns 腰椎角度（度）- 正の値: 屈曲（前屈）、負の値: 伸展（後屈）
 */
export const calculateLumbarFlexionExtension = (
  shoulderMid: { x: number; y: number; z: number },
  hipMid: { x: number; y: number; z: number }
) => {
  // 体幹ベクトル（肩から腰へ）
  const torsoVector = calculateVector(hipMid, shoulderMid);
  
  // 基準ベクトル（Y軸の負の方向 = 直立状態）
  const referenceVector = { x: 0, y: -1, z: 0 };
  
  // 角度を計算
  const angle = calculateAngleBetweenVectors(torsoVector, referenceVector);
  const angleInDegrees = radToDeg(angle);
  
  // 前後の方向を判定（Z座標を使用）
  // Z座標が正の場合は前屈、負の場合は後屈
  const isFlexion = torsoVector.z > 0;
  
  return isFlexion ? angleInDegrees : -angleInDegrees;
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
