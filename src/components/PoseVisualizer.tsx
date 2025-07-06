import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import type { PoseLandmarkerResult } from '../types';

// 体の接続部位の定義
const POSE_CONNECTIONS = [
  // 顔
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  // 腕
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [11, 23], [12, 24],
  // 胴体
  [9, 11], [12, 24], [23, 24],
  // 脚
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]
];

// ランドマークのカラー設定
const LANDMARK_COLORS: { [key: string]: string } = {
  default: 'red',
  hip: 'orange',
  knee: 'green',
  ankle: 'blue',
  shoulder: 'purple'
};

// 接続線のカラー設定
const CONNECTION_COLOR = 'rgba(255, 255, 255, 0.5)';

interface PoseVisualizerProps {
  result: PoseLandmarkerResult | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  testType: string;
}

/**
 * ポーズランドマーカーの結果を可視化するコンポーネント
 */
const PoseVisualizer: React.FC<PoseVisualizerProps> = ({ result, videoRef, testType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastDrawTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  // ランドマークの色を決定する（メモ化で最適化）
  const getLandmarkColor = useCallback((index: number): string => {
    if ([23, 24].includes(index)) return LANDMARK_COLORS.hip;
    if ([25, 26].includes(index)) return LANDMARK_COLORS.knee;
    if ([27, 28].includes(index)) return LANDMARK_COLORS.ankle;
    if ([11, 12].includes(index)) return LANDMARK_COLORS.shoulder;
    return LANDMARK_COLORS.default;
  }, []);

  // 重要なランドマークのインデックスをメモ化
  const highlightIndices = useMemo(() => {
    switch (testType) {
      case 'standingHipFlex':
        return [23, 24, 11, 12, 25, 26];
      case 'rockBack':
        return [11, 12, 23, 24, 25, 26, 27, 28];
      case 'seatedKneeExt':
        return [23, 24, 25, 26, 27, 28, 29, 30];
      default:
        return [];
    }
  }, [testType]);

  // 描画関数をメモ化して最適化
  const drawPose = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video || !result || !result.landmarks || result.landmarks.length === 0) {
      return;
    }

    // フレームレート制限（30FPS）- チラつき防止
    const now = performance.now();
    if (now - lastDrawTimeRef.current < 33) { // 33ms = 30FPS
      return;
    }
    lastDrawTimeRef.current = now;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスサイズが変更された場合のみ更新
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = result.landmarks[0];

    // 接続線を一括描画（パフォーマンス向上）
    ctx.lineWidth = 2;
    ctx.strokeStyle = CONNECTION_COLOR;
    ctx.beginPath();

    for (const [start, end] of POSE_CONNECTIONS) {
      if (landmarks[start] && landmarks[end]) {
        const startLandmark = landmarks[start];
        const endLandmark = landmarks[end];

        if ((startLandmark.visibility || 0) > 0.5 && (endLandmark.visibility || 0) > 0.5) {
          ctx.moveTo(startLandmark.x * canvas.width, startLandmark.y * canvas.height);
          ctx.lineTo(endLandmark.x * canvas.width, endLandmark.y * canvas.height);
        }
      }
    }
    ctx.stroke();

    // ランドマークを描画（重要なもののみ表示でパフォーマンス向上）
    landmarks.forEach((landmark, index) => {
      if ((landmark.visibility || 0) > 0.5 && highlightIndices.includes(index)) {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = getLandmarkColor(index);
        ctx.fill();
      }
    });

    // 評価に関連する特定のマーキング（テスト種類に応じて）
    if (testType === 'standingHipFlex' && landmarks[23] && landmarks[24] && landmarks[25] && landmarks[26]) {
      // 骨盤と大腿骨のラインを強調
      const hipMidX = (landmarks[23].x + landmarks[24].x) / 2 * canvas.width;
      const hipMidY = (landmarks[23].y + landmarks[24].y) / 2 * canvas.height;
      const kneeMidX = (landmarks[25].x + landmarks[26].x) / 2 * canvas.width;
      const kneeMidY = (landmarks[25].y + landmarks[26].y) / 2 * canvas.height;
      
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hipMidX, hipMidY);
      ctx.lineTo(kneeMidX, kneeMidY);
      ctx.stroke();
    }
    
    // ロックバックテスト：体幹の傾きと骨盤の傾きを強調
    if (testType === 'rockBack' && landmarks[11] && landmarks[12] && landmarks[23] && landmarks[24]) {
      const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2 * canvas.width;
      const shoulderMidY = (landmarks[11].y + landmarks[12].y) / 2 * canvas.height;
      const hipMidX = (landmarks[23].x + landmarks[24].x) / 2 * canvas.width;
      const hipMidY = (landmarks[23].y + landmarks[24].y) / 2 * canvas.height;
      
      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hipMidX, hipMidY);
      ctx.lineTo(shoulderMidX, shoulderMidY);
      ctx.stroke();
    }

    // 座位膝伸展テスト：膝の角度と骨盤の傾きを強調
    if (testType === 'seatedKneeExt' && landmarks[25] && landmarks[27] && landmarks[23]) {
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(landmarks[23].x * canvas.width, landmarks[23].y * canvas.height);
      ctx.lineTo(landmarks[25].x * canvas.width, landmarks[25].y * canvas.height);
      ctx.lineTo(landmarks[27].x * canvas.width, landmarks[27].y * canvas.height);
      ctx.stroke();
    }

  }, [result, videoRef, testType, highlightIndices, getLandmarkColor]);

  // useEffectで描画をスケジュール
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(drawPose);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawPose]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full object-contain"
      />
    </div>
  );
};

export default PoseVisualizer;
