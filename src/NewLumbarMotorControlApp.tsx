import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause } from 'lucide-react';

// MediaPipe の型定義
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// カスタムフックのインポート
import { usePoseLandmarker } from './hooks/usePoseLandmarker';
import { useMetrics } from './hooks/useMetrics';

// =================================================================
// 1. タイプ定義
// =================================================================
type TestType = 'standingHipFlex' | 'rockBack' | 'seatedKneeExt';

interface Metric {
  label: string;
  value: number;
  unit: string;
  normalRange: string;
  status: 'normal' | 'caution' | 'abnormal';
  description: string;
}

// =================================================================
// 2. 定数定義
// =================================================================
const TEST_LABELS: Record<TestType, string> = {
  standingHipFlex: '立位股関節屈曲テスト',
  rockBack: 'ロックバックテスト',
  seatedKneeExt: '座位膝伸展テスト'
};

// デモ動画のURLマッピング
const DEMO_VIDEOS: Record<TestType, string> = {
  standingHipFlex: 'https://storage.googleapis.com/mediapipe-assets/standing-hip.mp4',
  rockBack: 'https://storage.googleapis.com/mediapipe-assets/rock-back.mp4',
  seatedKneeExt: 'https://storage.googleapis.com/mediapipe-assets/seated-knee.mp4'
};

// =================================================================
// 3. ユーティリティコンポーネント
// =================================================================

// テスト選択コンポーネント
const TestSelector: React.FC<{
  currentTest: TestType;
  onChange: (test: TestType) => void;
}> = ({ currentTest, onChange }) => {
  return (
    <div className="bg-white rounded-lg shadow-md mb-4">
      <div className="flex border-b">
        {(Object.keys(TEST_LABELS) as TestType[]).map((type) => (
          <button
            key={type}
            className={`flex-1 py-3 px-4 text-center transition-colors ${
              currentTest === type
                ? 'bg-blue-500 text-white font-medium'
                : 'hover:bg-gray-100'
            }`}
            onClick={() => onChange(type)}
          >
            {TEST_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
};

// 注意: 将来的に動画アップローダーコンポーネントが必要になる場合は再実装してください

// 姿勢ビジュアライザー
const PoseVisualizer: React.FC<{
  landmarks: NormalizedLandmark[][] | null;
  videoWidth: number;
  videoHeight: number;
}> = ({ landmarks, videoWidth, videoHeight }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ランドマークを描画するためのEffect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !landmarks || landmarks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 以前の描画をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 描画キャンバスのサイズ調整
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // 最初の人物のランドマーク
    const personLandmarks = landmarks[0];

    // スケルトン描画用の操作
    const drawConnections = () => {
      if (!personLandmarks) return;
      
      // 接続線の定義（MediaPipe BlazePose GHUMモデルのスケルトン）
      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], // 顔と首
        [9, 10], // 肩
        [11, 13], [13, 15], [15, 17], [17, 19], [19, 15], [15, 21], // 左腕
        [12, 14], [14, 16], [16, 18], [18, 20], [20, 16], [16, 22], // 右腕
        [11, 23], [12, 24], [23, 24], // 上半身
        [23, 25], [25, 27], [27, 29], [29, 31], [31, 27], // 左足
        [24, 26], [26, 28], [28, 30], [30, 32], [32, 28]  // 右足
      ];

      // 接続線を描画
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 2;

      connections.forEach(([start, end]) => {
        if (personLandmarks[start] && personLandmarks[end] && 
            personLandmarks[start].visibility && personLandmarks[end].visibility &&
            personLandmarks[start].visibility > 0.5 && personLandmarks[end].visibility > 0.5) {
          ctx.beginPath();
          ctx.moveTo(
            personLandmarks[start].x * videoWidth,
            personLandmarks[start].y * videoHeight
          );
          ctx.lineTo(
            personLandmarks[end].x * videoWidth,
            personLandmarks[end].y * videoHeight
          );
          ctx.stroke();
        }
      });
    };

    // ランドマーク（点）を描画
    if (personLandmarks) {
      // 点を描画
      personLandmarks.forEach((landmark) => {
        // 座標変換: 正規化された座標から絶対座標に変換
        const x = landmark.x * videoWidth;
        const y = landmark.y * videoHeight;
        
        // 可視性が低いランドマークは描画しない
        if (landmark.visibility && landmark.visibility > 0.5) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.fill();
        }
      });

      // スケルトン線を描画
      drawConnections();
    }

  }, [landmarks, videoWidth, videoHeight]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
    />
  );
};

// 指標表示
const MetricsDisplay: React.FC<{ metrics: Metric[] }> = ({ metrics }) => {
  if (!metrics || metrics.length === 0) {
    return <p className="text-gray-500 text-center">指標の計算中...</p>;
  }

  return (
    <div>
      <h3 className="text-lg font-medium mb-3">評価結果</h3>
      <div className="space-y-4">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-gray-50 p-3 rounded-md">
            <div className="flex justify-between items-center mb-1">
              <h4 className="font-medium">{metric.label}</h4>
              <span className={`px-2 py-0.5 rounded text-sm ${
                metric.status === 'normal' ? 'bg-green-100 text-green-800' :
                metric.status === 'caution' ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {metric.status === 'normal' ? '正常' : metric.status === 'caution' ? '注意' : '異常'}
              </span>
            </div>
            <p className="text-2xl font-bold">{metric.value} {metric.unit}</p>
            <p className="text-sm text-gray-600">基準範囲: {metric.normalRange}</p>
            <p className="text-xs mt-1 text-gray-500">{metric.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// =================================================================
// 5. メインアプリケーションコンポーネント
// =================================================================
export const NewLumbarMotorControlApp: React.FC = () => {
  // テスト種類の状態管理
  const [testType, setTestType] = useState<TestType>('standingHipFlex');
  const [videoUrl, setVideoUrl] = useState<string>(DEMO_VIDEOS[testType]);
  const [userUploadedVideo, setUserUploadedVideo] = useState<string | null>(null);
  const [useUploadedVideo, setUseUploadedVideo] = useState<boolean>(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  
  // ビデオ要素への参照
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // ポーズ検出フックの利用
  const { result, isReady } = usePoseLandmarker(videoRef, isVideoLoaded);
  
  // ランドマークの取得
  const landmarks = result?.landmarks || null;
  
  // モデルの状態を更新
  useEffect(() => {
    setIsModelLoaded(isReady);
  }, [isReady]);
  
  // 指標の計算
  const metrics = useMetrics(result, testType);

  const handleVideoUpload = useCallback((file: File) => {
    // 動画がアップロードされたとき
    const url = URL.createObjectURL(file);
    setUserUploadedVideo(url);
    setUseUploadedVideo(true);
    setVideoUrl(url);  // アップロードされた動画を現在の動画として設定
    setIsVideoLoaded(false);  // 動画切り替え時にリセット
    setIsPlaying(false);  // 一時停止状態に戻す
    console.log('動画がアップロードされました:', url);
  }, []);

  // テスト種類が変更されたときの動画切り替え処理
  useEffect(() => {
    if (useUploadedVideo && userUploadedVideo) {
      // アップロード動画を優先的に表示
      setVideoUrl(userUploadedVideo);
    } else {
      // 非アップロード時はテスト種類に応じたデモ動画を表示
      setVideoUrl(DEMO_VIDEOS[testType]);
    }
    // 動画切り替え時の状態リセット
    setIsVideoLoaded(false);
    setIsPlaying(false);
    // ログ出力
    console.log('テスト種類変更:', testType, useUploadedVideo ? 'アップロード動画表示' : 'デモ動画表示');
    // 動画を停止
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [testType, useUploadedVideo, userUploadedVideo]);

  // 初期化時にデフォルトのデモ動画をセットする
  useEffect(() => {
    // 初期値の一回セットのみ
    const defaultVideo = DEMO_VIDEOS.standingHipFlex;
    setVideoUrl(defaultVideo);
    console.log(`デフォルト動画のセット: ${defaultVideo}`);
  }, []);

  // デモ動画とアップロード動画の切り替え
  const toggleVideoSource = useCallback(() => {
    setUseUploadedVideo(prev => !prev);
  }, []);

  // 再生/一時停止トグル
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // 動画のロード完了時の処理
  const handleVideoLoaded = useCallback(() => {
    setIsVideoLoaded(true);
    console.log('動画のロード完了');
  }, []);

  // ファイルアップロード用の隠しInput参照
  const fileInputRef = useRef<HTMLInputElement>(null);

  // JSXレンダリング部分
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">腰部運動制御評価アプリケーション</h1>
      
      {/* テストセレクター */}
      <TestSelector currentTest={testType} onChange={setTestType} />
      
      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左側: 動画と操作UIエリア */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4">{TEST_LABELS[testType]}</h2>
            
            {/* 動画表示エリア */}
            <div className="relative aspect-video bg-black rounded overflow-hidden mb-4">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                onLoadedData={handleVideoLoaded}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
              
              {/* ポーズ描画オーバーレイ */}
              {isVideoLoaded && landmarks && (
                <PoseVisualizer 
                  landmarks={landmarks as NormalizedLandmark[][]} 
                  videoWidth={videoRef.current?.videoWidth || 640}
                  videoHeight={videoRef.current?.videoHeight || 480}
                />
              )}
              
              {/* 読み込み中表示 */}
              {!isVideoLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                  動画読み込み中...
                </div>
              )}
            </div>
            
            {/* 動画コントロールエリア */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              {/* 再生/一時停止ボタン */}
              <button 
                className="flex items-center space-x-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                onClick={togglePlayPause}
                disabled={!isVideoLoaded}
              >
                {isPlaying ? (
                  <>
                    <Pause size={16} />
                    <span>一時停止</span>
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    <span>再生</span>
                  </>
                )}
              </button>
              
              <div className="flex space-x-3">
                {/* デモ動画/アップロード動画切り替えボタン - ユーザーがアップロードした動画がある場合のみ表示 */}
                {userUploadedVideo && (
                  <button 
                    className={`px-3 py-2 rounded border ${
                      useUploadedVideo 
                        ? 'bg-gray-100 border-gray-400' 
                        : 'bg-white border-gray-300'
                    }`}
                    onClick={toggleVideoSource}
                  >
                    {useUploadedVideo ? 'デモ動画を使用' : 'アップロード動画を使用'}
                  </button>
                )}
                
                {/* 動画アップロードボタン */}
                <button 
                  className="px-3 py-2 rounded border border-gray-300 bg-white flex items-center space-x-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>動画をアップロード</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleVideoUpload(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>
            
            {/* モデルロード状態 */}
            <div className="text-sm text-gray-500">
              モデル状態: {isModelLoaded ? '読み込み完了' : '読み込み中...'}
            </div>
          </div>
        </div>
        
        {/* 右側: 評価結果表示エリア */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-lg font-semibold mb-4">評価結果</h2>
          
          {/* 評価指標の表示 */}
          {isVideoLoaded ? (
            <MetricsDisplay metrics={metrics} />
          ) : (
            <p className="text-gray-500 text-center">動画を再生すると評価結果が表示されます</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewLumbarMotorControlApp;
