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
  // MediaPipe座標系での前後傾角度計算
  // 重要：MediaPipeのZ軸の向きを確認して修正
  
  // 前屈と後屈の判定基準を修正（デバッグログに基づく）
  // 実際のログから判明：前屈時 Z差=-0.070 (肩が腰よりカメラから遠い)
  // MediaPipe Z軸: 正方向 = カメラから遠ざかる方向
  
  const shoulderToHipZ = shoulderMid.z - hipMid.z; // Z方向の差
  const shoulderToHipY = shoulderMid.y - hipMid.y; // Y方向の差（負が上方向）
  
  // 角度計算を修正：Z軸の符号を反転して正しい前屈/後屈を検出
  // 前屈時: shoulderToHipZ < 0 → 正の角度にする
  // 後屈時: shoulderToHipZ > 0 → 負の角度にする
  let lumbarAngle = Math.atan2(-shoulderToHipZ, -shoulderToHipY); // Z軸とY軸両方を反転
  lumbarAngle = radToDeg(lumbarAngle);
  
  // これで前屈時に正の角度、後屈時に負の角度になるはず
  
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
  if (Math.random() < 1.0) { // 100%の確率でログ出力（修正確認用）
    // 体幹ベクトルも表示
    const torsoVector = {
      x: shoulderMid.x - hipMid.x,
      y: shoulderMid.y - hipMid.y,
      z: shoulderMid.z - hipMid.z
    };
    
    console.log('🔍 腰椎角度計算詳細:', {
      肩座標: { y: shoulderMid.y.toFixed(3), z: shoulderMid.z.toFixed(3) },
      腰座標: { y: hipMid.y.toFixed(3), z: hipMid.z.toFixed(3) },
      'Z差(肩-腰)': (shoulderMid.z - hipMid.z).toFixed(3),
      'Y差(肩-腰)': (shoulderMid.y - hipMid.y).toFixed(3),
      体幹ベクトル: { y: torsoVector.y.toFixed(3), z: torsoVector.z.toFixed(3) },
      生角度: rawAngle.toFixed(1) + '°',
      フィルター後: filteredAngle.toFixed(1) + '°',
      判定: filteredAngle > 5 ? '🔴屈曲' : filteredAngle < -5 ? '🔵伸展' : '⚪中立'
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
