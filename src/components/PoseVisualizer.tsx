import React, { useRef, useEffect } from 'react';
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

  // ランドマークの色を決定する
  const getLandmarkColor = (index: number): string => {
    if ([23, 24].includes(index)) return LANDMARK_COLORS.hip;
    if ([25, 26].includes(index)) return LANDMARK_COLORS.knee;
    if ([27, 28].includes(index)) return LANDMARK_COLORS.ankle;
    if ([11, 12].includes(index)) return LANDMARK_COLORS.shoulder;
    return LANDMARK_COLORS.default;
  };

  // ポーズの可視化を描画
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video || !result || !result.landmarks || result.landmarks.length === 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return; // コンテキストが取得できない場合は早期リターン

    // キャンバスのサイズをビデオに合わせる
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const landmarks = result.landmarks[0];
    const highlightIndices: number[] = [];

    // 各テストタイプに応じて重要なランドマークを設定
    switch (testType) {
      case 'standingHipFlex':
        // 股関節屈曲テスト：骨盤、腰椎、膝のランドマークを強調
        highlightIndices.push(23, 24, 11, 12, 25, 26);
        break;
      case 'rockBack':
        // ロックバックテスト：脊椎、骨盤、膝のランドマークを強調
        highlightIndices.push(11, 12, 23, 24, 25, 26, 27, 28);
        break;
      case 'seatedKneeExt':
        // 座位膝伸展テスト：膝、骨盤、足首のランドマークを強調
        highlightIndices.push(23, 24, 25, 26, 27, 28, 29, 30);
        break;
    }

    // 接続線を描画
    ctx.lineWidth = 2;
    ctx.strokeStyle = CONNECTION_COLOR;

    for (const [start, end] of POSE_CONNECTIONS) {
      if (landmarks[start] && landmarks[end]) {
        const startLandmark = landmarks[start];
        const endLandmark = landmarks[end];

        if ((startLandmark.visibility || 0) > 0.5 && (endLandmark.visibility || 0) > 0.5) {
          ctx.beginPath();
          ctx.moveTo(startLandmark.x * canvas.width, startLandmark.y * canvas.height);
          ctx.lineTo(endLandmark.x * canvas.width, endLandmark.y * canvas.height);
          ctx.stroke();
        }
      }
    }

    // ランドマークを描画
    landmarks.forEach((landmark, index) => {
      if ((landmark.visibility || 0) > 0.5) {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;
        
        // 基本サイズと重要なランドマークの場合は大きく表示
        const radius = highlightIndices.includes(index) ? 8 : 4;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = getLandmarkColor(index);
        ctx.fill();
        
        // インデックス番号を表示（開発時に有効化する場合はコメントを外す）
        if (false) { // デバッグ時にtrueに変更
          // 非Nullアサーション演算子の使用（ctxはnullではないとコンパイラに保証）
          ctx!.fillStyle = 'white';
          ctx!.font = '12px Arial';
          ctx!.fillText(index.toString(), x + 10, y - 10);
        }
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

  }, [result, videoRef, testType]);

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
