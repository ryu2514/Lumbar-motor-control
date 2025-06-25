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
  
  // 前後方向の角度を計算（Y-Z平面での投影）
  // Z軸正方向 = 前方、Y軸負方向 = 上方
  const forwardTilt = Math.atan2(torsoVector.z, -torsoVector.y);
  let angleInDegrees = radToDeg(forwardTilt);
  
  // 角度を-180°～180°から-90°～90°の範囲に正規化
  if (angleInDegrees > 90) {
    angleInDegrees = 180 - angleInDegrees;
  } else if (angleInDegrees < -90) {
    angleInDegrees = -180 - angleInDegrees;
  }
  
  // 前屈/後屈の判定を明確にする
  // 正の値: 前屈（屈曲）、負の値: 後屈（伸展）
  let lumbarAngle = angleInDegrees;
  
  // ノイズフィルタリング
  if (Math.abs(lumbarAngle) < 3) {
    lumbarAngle = 0; // 小さな動きは中立とする
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
  if (Math.random() < 0.1) { // 10%の確率でログ出力
    console.log('角度計算詳細:', {
      shoulderMid: { y: shoulderMid.y.toFixed(3), z: shoulderMid.z.toFixed(3) },
      hipMid: { y: hipMid.y.toFixed(3), z: hipMid.z.toFixed(3) },
      rawAngle: rawAngle.toFixed(1),
      filteredAngle: filteredAngle.toFixed(1)
    });
  }
  
  return filteredAngle;
};

/**
 * 角度フィルターをリセット（新しい動画開始時など）
 */
export const resetAngleFilter = (): void => {
  angleFilter.reset();
};
