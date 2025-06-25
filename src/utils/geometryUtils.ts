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
  
  // Y-Z平面での角度計算（安定性を向上）
  const torsoAngle = Math.atan2(torsoVector.z, -torsoVector.y);
  const angleInDegrees = radToDeg(torsoAngle);
  
  // 角度の正規化と安定化
  let normalizedAngle = angleInDegrees;
  
  // 角度の範囲を-90°から+90°に制限
  if (normalizedAngle > 90) {
    normalizedAngle = 180 - normalizedAngle;
  } else if (normalizedAngle < -90) {
    normalizedAngle = -180 - normalizedAngle;
  }
  
  // 小さな変動をフィルタリング（ノイズ除去）
  if (Math.abs(normalizedAngle) < 2) {
    normalizedAngle = 0;
  }
  
  // 胸腰椎測定に適したスケーリング
  // 前屈（正の値）: 0°～45°、後屈（負の値）: 0°～-30°
  const scalingFactor = normalizedAngle > 0 ? 0.9 : 1.2; // 屈曲/伸展で異なるスケーリング
  const scaledAngle = normalizedAngle * scalingFactor;
  
  // 最終的な角度制限
  const finalAngle = Math.max(-45, Math.min(60, scaledAngle));
  
  return finalAngle;
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
  private maxHistory = 5;

  filter(angle: number): number {
    this.history.push(angle);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    // 移動平均を計算
    const avg = this.history.reduce((sum, val) => sum + val, 0) / this.history.length;
    return avg;
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
  return angleFilter.filter(rawAngle);
};

/**
 * 角度フィルターをリセット（新しい動画開始時など）
 */
export const resetAngleFilter = (): void => {
  angleFilter.reset();
};
