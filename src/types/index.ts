// MediaPipe types
export interface NormalizedLandmark {
  x: number;
  y: number;  
  z: number;
  visibility?: number;
}

export interface PoseLandmarkerResult {
  landmarks: NormalizedLandmark[][];
  worldLandmarks: NormalizedLandmark[][];
}

// テスト種類 (Test types)
export type TestType = "standingHipFlex" | "rockBack" | "seatedKneeExt";

export interface Metric {
  label: string;
  value: number;
  unit: string;
  status: 'normal' | 'caution' | 'abnormal';
  description: string;
  normalRange: string;
}

// ランドマークインデックス (MediaPipe BlazePose 33-point model)
export const LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30
};
