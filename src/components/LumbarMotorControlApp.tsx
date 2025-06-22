import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, Play, Pause, RotateCcw, Info, AlertCircle, CheckCircle, Clock } from 'lucide-react';

// MediaPipe types (simplified for demo)
interface NormalizedLandmark {
  x: number;
  y: number;  
  z: number;
  visibility?: number;
}

interface PoseLandmarkerResult {
  landmarks: NormalizedLandmark[][];
  worldLandmarks: NormalizedLandmark[][];
}

// Test types - updated for the three specific tests
export type TestType = "standingHipFlex" | "rockBack" | "seatedKneeExt";

export interface Metric {
  label: string;
  value: number;
  unit: string;
  status: 'normal' | 'caution' | 'abnormal';
  description: string;
  normalRange: string;
}

// Pose landmark indices (MediaPipe BlazePose 33-point model)
const LANDMARKS = {
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

// Helper functions for pose analysis
const radToDeg = (rad: number) => (rad * 180) / Math.PI;

const calculateVector = (pointA: NormalizedLandmark, pointB: NormalizedLandmark) => ({
  x: pointB.x - pointA.x,
  y: pointB.y - pointA.y,
  z: pointB.z - pointA.z
});

const calculateMagnitude = (vector: { x: number; y: number; z: number }) =>
  Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);

const calculateAngleBetweenVectors = (v1: any, v2: any) => {
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = calculateMagnitude(v1);
  const mag2 = calculateMagnitude(v2);
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 + 1e-6))));
};

const calculate2DAngle = (p1: any, vertex: any, p2: any) => {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2 + 1e-6))));
};

// Main application component
const LumbarMotorControlApp: React.FC = () => {
  const [testType, setTestType] = useState<TestType>('standingHipFlex');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [previousMetrics, setPreviousMetrics] = useState<Metric[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null) as RefObject<HTMLVideoElement>;
  
  // MediaPipeのポーズ検出結果
  const poseResult = usePoseLandmarker(videoRef);
  
  // ポーズデータから測定指標を計算
  const metrics = useMetrics(poseResult, testType);

  // ポーズ結果をデバッグ出力
  useEffect(() => {
    if (poseResult && poseResult.landmarks && poseResult.landmarks.length > 0) {
      console.log('✅ ポーズ結果受信: ランドマーク検出', poseResult.landmarks[0].length);
    }
  }, [poseResult]);

  // ビデオファイルが変更されたときにURLを更新
  useEffect(() => {
    if (videoFile) {
      console.log('ℹ️ ビデオファイルがアップロードされました:', {
        name: videoFile.name,
        type: videoFile.type,
        size: `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB`
      });
      
      const newVideoUrl = URL.createObjectURL(videoFile);
      console.log('✅ ビデオURLを生成しました:', newVideoUrl);
      setVideoUrl(newVideoUrl);
      
      // 以前のURLをクリーンアップ
      return () => {
        URL.revokeObjectURL(newVideoUrl);
      };
    }
  }, [videoFile]);

  // ビデオの再生状態を制御
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      console.log('❌ ビデオ要素が存在しないため再生制御をスキップ');
      return;
    }

    console.log('ℹ️ 再生状態変更:', isPlaying ? '再生開始' : '一時停止');

    if (isPlaying) {
      videoElement.play().catch(error => {
        console.error('❌ ビデオの再生に失敗しました:', error);
        setIsPlaying(false);
      });
    } else {
      videoElement.pause();
    }
  }, [isPlaying]);

  // テストタイプが変更されたときに再生をリセット
  useEffect(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
    
    // 現在の測定値を保存
    if (metrics.length > 0) {
      setPreviousMetrics(metrics);
    }
  }, [testType]);

  // ビデオファイルのアップロード処理
  const handleVideoLoad = (file: File) => {
    console.log('✅ handleVideoLoadが呼ばれました:', file.name);
    
    // 再生状態をリセット
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      console.log('✅ ビデオ再生時間をリセットしました');
    }
    
    // videoFileを更新することでuseEffectが発火し、URLが生成される
    setVideoFile(file);
  };

  // ビデオ再生コントロール
  const togglePlayPause = () => {
    console.log('ℹ️ 再生/一時停止ボタン押下');
    setIsPlaying(prev => !prev);
  };

  // ビデオを5秒戻す
  const seekBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
    }
  };

  // ビデオを5秒進める
  const seekForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(
        videoRef.current.duration || 0,
        videoRef.current.currentTime + 5
      );
    }
  };

  // テスト種類の変更
  const handleTestTypeChange = (newType: TestType) => {
    setTestType(newType);
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-10">
      {/* ヘッダー */}
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">腰椎運動制御評価アプリ</h1>
          <p className="text-blue-100">MediaPipe Pose Landmarkerを使用した動作解析</p>
        </div>
      </header>
      
      <main className="container mx-auto p-4 md:p-6 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左サイドバー：テスト選択と情報 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800">評価テストを選択</h2>
              
              <div className="flex flex-col space-y-2">
                <button
                  onClick={() => handleTestTypeChange('standingHipFlex')}
                  className={`p-3 rounded-md text-left ${
                    testType === 'standingHipFlex'
                      ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  立位股関節屈曲テスト
                </button>
                
                <button
                  onClick={() => handleTestTypeChange('rockBack')}
                  className={`p-3 rounded-md text-left ${
                    testType === 'rockBack'
                      ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  ロックバックテスト
                </button>
                
                <button
                  onClick={() => handleTestTypeChange('seatedKneeExt')}
                  className={`p-3 rounded-md text-left ${
                    testType === 'seatedKneeExt'
                      ? 'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  座位膝関節伸展テスト
                </button>
              </div>
            </div>
            
            {/* テスト情報 */}
            <div className="mb-6">
              <TestInfo testType={testType} />
            </div>
            
            {/* 進捗ボタン（小画面では非表示） */}
            <div className="hidden lg:block">
              <button
                onClick={() => setShowProgress(prev => !prev)}
                className="w-full p-3 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                {showProgress ? '評価指標を表示' : '進捗状況を表示'}
              </button>
            </div>
          </div>
          
          {/* メインコンテンツ：動画と解析 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 動画アップローダー */}
            <VideoUploader onVideoLoad={handleVideoLoad} testType={testType} />
            
            {/* 動画プレーヤーとビジュアライザー */}
            <div className="bg-gray-800 rounded-lg shadow relative">
              {error ? (
                <div className="p-4 bg-red-100 text-red-800 rounded-lg mb-4 flex flex-col items-center">
                  <p className="mb-2">{error}</p>
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.load();
                      }
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    再読み込みを試す
                  </button>
                </div>
              ) : videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full h-full object-contain"
                    controls={false}
                    playsInline
                    muted={true}
                    preload="metadata"
                    crossOrigin="anonymous"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        console.log(`ℹ️ 現在の再生時間: ${videoRef.current.currentTime.toFixed(2)}/${videoRef.current.duration.toFixed(2)}`);
                      }
                    }}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        console.log(`✅ ビデオメタデータ読み込み完了: 長さ ${videoRef.current.duration.toFixed(2)} 秒`);
                      }
                    }}
                    onError={(e) => {
                      const error = (e.target as HTMLVideoElement).error;
                      console.error('❌ ビデオエラー詳細:', {
                        code: error?.code,
                        message: error?.message,
                        networkState: (e.target as HTMLVideoElement).networkState,
                        readyState: (e.target as HTMLVideoElement).readyState
                      });
                      setError(`ビデオ読み込みエラー: ${error?.message || 'Unknown error'}`);
                    }}
                    onCanPlay={() => {
                      console.log('✅ ビデオ再生準備完了');
                      setError(null);
                    }}
                    onEnded={() => setIsPlaying(false)}
                  >
                    <source src={videoUrl} type="video/mp4" />
                    お使いのブラウザはビデオタグをサポートしていません。
                  </video>
                  <PoseVisualizer result={poseResult} videoRef={videoRef} testType={testType} />
                </>
              ) : (
                <div className="aspect-video flex items-center justify-center bg-gray-900 text-gray-400 rounded-t-lg">
                  動画をアップロードすると、ここに表示されます
                </div>
              )}
              
              {/* ビデオコントロール */}
              {videoUrl && (
                <div className="p-3 bg-gray-700 rounded-b-lg flex justify-center space-x-4">
                  <button
                    onClick={seekBackward}
                    className="p-2 rounded-full hover:bg-gray-600 text-gray-300"
                    aria-label="5秒戻す"
                  >
                    <RotateCcw size={20} />
                  </button>
                  
                  <button
                    onClick={togglePlayPause}
                    className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
                    aria-label={isPlaying ? '一時停止' : '再生'}
                  >
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  
                  <button
                    onClick={seekForward}
                    className="p-2 rounded-full hover:bg-gray-600 text-gray-300"
                    aria-label="5秒進める"
                  >
                    <RotateCw size={20} />
                  </button>
                </div>
              )}
            </div>
            
            {/* 進捗/指標切り替えボタン（小画面のみ） */}
            <div className="lg:hidden">
              <button
                onClick={() => setShowProgress(prev => !prev)}
                className="w-full p-3 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                {showProgress ? '評価指標を表示' : '進捗状況を表示'}
              </button>
            </div>
            
            {/* 評価指標または進捗状況 */}
            <div>
              {showProgress ? (
                <ProgressTracker metrics={metrics} previousMetrics={previousMetrics} />
              ) : (
                <MetricsDisplay metrics={metrics} />
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* フッター */}
      <footer className="mt-10 py-6 bg-gray-800 text-gray-300">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="mb-2">
              このアプリケーションは教育・研究用途のために開発されています。
              臨床診断には使用しないでください。
            </p>
            <p className="text-sm">
              Powered by MediaPipe Pose Landmarker (runtime = mediapipe)
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LumbarMotorControlApp;
