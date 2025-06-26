import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause, BarChart3, Activity } from 'lucide-react';

// MediaPipe の型定義
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// カスタムフックのインポート
import { usePoseLandmarker } from './hooks/usePoseLandmarker';
import { useMetrics } from './hooks/useMetrics';
import { useTimeSeriesData } from './hooks/useTimeSeriesData';

// ユーティリティのインポート
import { resetAngleFilter } from './utils/geometryUtils';

// コンポーネントのインポート
import { LumbarAngleChartWithStats } from './components/LumbarAngleChart';

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
  standingHipFlex: '/demo-videos/立位股関節屈曲.mp4',
  rockBack: '/demo-videos/ロックバック.mp4',
  seatedKneeExt: '/demo-videos/座位膝伸展.mp4'
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

// 腰椎角度ビジュアライザー
const LumbarAngleVisualizer: React.FC<{ angle: number }> = ({ angle }) => {
  const maxAngle = 90; // 最大表示角度
  const normalizedAngle = Math.max(-maxAngle, Math.min(maxAngle, angle));
  const rotationAngle = normalizedAngle;
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-md mb-4">
      <h3 className="text-lg font-medium mb-3 text-center">胸腰椎角度リアルタイム表示</h3>
      <div className="flex items-center justify-center">
        <div className="relative w-32 h-32">
          {/* 背景円 */}
          <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
          
          {/* 角度範囲表示 */}
          <div className="absolute inset-2 border-2 border-gray-100 rounded-full"></div>
          
          {/* 0度マーカー */}
          <div className="absolute top-0 left-1/2 w-0.5 h-4 bg-gray-400 transform -translate-x-0.5"></div>
          
          {/* 30度マーカー（注意範囲） */}
          <div 
            className="absolute top-2 left-1/2 w-0.5 h-3 bg-yellow-400 transform -translate-x-0.5"
            style={{ transform: 'translateX(-50%) rotate(30deg)', transformOrigin: '50% 60px' }}
          ></div>
          <div 
            className="absolute top-2 left-1/2 w-0.5 h-3 bg-yellow-400 transform -translate-x-0.5"
            style={{ transform: 'translateX(-50%) rotate(-20deg)', transformOrigin: '50% 60px' }}
          ></div>
          
          {/* 45度/30度マーカー（日整会基準上限） */}
          <div 
            className="absolute top-2 left-1/2 w-0.5 h-3 bg-red-400 transform -translate-x-0.5"
            style={{ transform: 'translateX(-50%) rotate(45deg)', transformOrigin: '50% 60px' }}
          ></div>
          <div 
            className="absolute top-2 left-1/2 w-0.5 h-3 bg-red-400 transform -translate-x-0.5"
            style={{ transform: 'translateX(-50%) rotate(-30deg)', transformOrigin: '50% 60px' }}
          ></div>
          
          {/* 中心点 */}
          <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-gray-600 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
          
          {/* 角度インジケーター */}
          <div 
            className={`absolute top-1/2 left-1/2 w-0.5 origin-bottom transform -translate-x-0.5 transition-transform duration-200 ${
              (angle > 45 || angle < -30) ? 'bg-red-500' :
              (angle > 30 || angle < -20) ? 'bg-yellow-500' :
              'bg-green-500'
            }`}
            style={{ 
              height: '50px',
              transform: `translateX(-50%) translateY(-100%) rotate(${rotationAngle}deg)`,
              transformOrigin: 'bottom center'
            }}
          ></div>
        </div>
        
        {/* 数値表示 */}
        <div className="ml-6">
          <div className={`text-3xl font-bold ${
            (angle > 45 || angle < -30) ? 'text-red-500' :
            (angle > 30 || angle < -20) ? 'text-yellow-500' :
            'text-green-500'
          }`}>
            {angle.toFixed(1)}°
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {angle > 30 ? '腰椎屈曲' : angle < -20 ? '腰椎伸展' : '正常範囲'}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            日整会基準: 屈曲45° / 伸展30°<br/>
            ※胸腰椎一括測定・誤差あり
          </div>
        </div>
      </div>
    </div>
  );
};

// 指標表示
const MetricsDisplay: React.FC<{ metrics: Metric[] }> = ({ metrics }) => {
  if (!metrics || metrics.length === 0) {
    return <p className="text-gray-500 text-center">指標の計算中...</p>;
  }

  // 胸腰椎角度データを抽出
  const lumbarAngleMetric = metrics.find(m => m.label === '胸腰椎屈曲・伸展角度');

  return (
    <div>
      {/* 胸腰椎角度の視覚的表示 */}
      {lumbarAngleMetric && (
        <LumbarAngleVisualizer angle={lumbarAngleMetric.value} />
      )}
      
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
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('初期化中...');
  const [showChart, setShowChart] = useState<boolean>(false);
  const [videoRetryCount, setVideoRetryCount] = useState<number>(0);
  
  // ビデオ要素への参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const demoVideoRef = useRef<HTMLVideoElement>(null);
  
  // デモ動画の状態管理
  const [isDemoVideoLoaded, setIsDemoVideoLoaded] = useState<boolean>(false);
  
  // ポーズ検出フックの利用
  const { result, isReady } = usePoseLandmarker(videoRef, isVideoLoaded);
  const { result: demoResult, isReady: isDemoReady } = usePoseLandmarker(demoVideoRef, isDemoVideoLoaded);
  
  // ランドマークの取得
  const landmarks = result?.landmarks || null;
  const demoLandmarks = demoResult?.landmarks || null;
  
  // モデルの状態を更新
  useEffect(() => {
    setIsModelLoaded(isReady);
    if (isReady) {
      setStatusMessage('姿勢検出モデル読み込み完了');
    } else {
      setStatusMessage('姿勢検出モデル読み込み中...');
    }
  }, [isReady]);
  
  // 指標の計算
  const metrics = useMetrics(result, testType);
  
  // 時系列データ管理
  const {
    timeSeriesData,
    startRecording,
    stopRecording,
    addDataPoint,
    clearData,
    exportData,
    getStatistics
  } = useTimeSeriesData();
  
  // 動画再生状態に応じた自動記録制御
  useEffect(() => {
    console.log('Auto recording check:', { 
      isPlaying, 
      isVideoLoaded, 
      isModelLoaded, 
      isRecording: timeSeriesData.isRecording 
    });
    
    if (isPlaying && isVideoLoaded && isModelLoaded && !timeSeriesData.isRecording) {
      // 動画が再生開始されたら自動的に記録開始
      console.log('Starting auto recording...');
      startRecording();
      setStatusMessage('動画再生開始 - 角度記録を自動開始しました');
    } else if (!isPlaying && timeSeriesData.isRecording) {
      // 動画が停止されたら記録も停止
      console.log('Stopping auto recording...');
      stopRecording();
      setStatusMessage('動画停止 - 角度記録を停止しました');
    }
  }, [isPlaying, isVideoLoaded, isModelLoaded]);

  // 胸腰椎角度の取得と記録
  useEffect(() => {
    const lumbarAngleMetric = metrics.find(m => m.label === '胸腰椎屈曲・伸展角度');
    if (lumbarAngleMetric && timeSeriesData.isRecording) {
      addDataPoint(lumbarAngleMetric.value);
    }
  }, [metrics, timeSeriesData.isRecording, addDataPoint]);

  const handleVideoUpload = useCallback((file: File) => {
    setStatusMessage('動画をアップロード中...');
    const url = URL.createObjectURL(file);
    setUserUploadedVideo(url);
    setUseUploadedVideo(true);
    setVideoUrl(url);
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setIsDemoVideoLoaded(false);
    setVideoRetryCount(0);
    setShowComparison(true);
    
    // 動画要素をリセット
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    
    if (demoVideoRef.current) {
      demoVideoRef.current.pause();
      demoVideoRef.current.currentTime = 0;
    }
    
    console.log('動画がアップロードされました:', url);
  }, []);

  // テスト種類が変更されたときの動画切り替え処理
  useEffect(() => {
    // 記録中の場合は停止（依存配列から除外するためcallbackを使用）
    if (timeSeriesData.isRecording) {
      stopRecording();
    }
    
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
    setIsDemoVideoLoaded(false);
    setVideoRetryCount(0);
    setStatusMessage('新しい動画を読み込み中...');
    
    // 角度フィルターをリセット
    resetAngleFilter();
    
    // ログ出力
    console.log('テスト種類変更:', testType, useUploadedVideo ? 'アップロード動画表示' : 'デモ動画表示');
    
    // 動画を停止
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // 動画を最初に戻す
    }
    
    if (demoVideoRef.current) {
      demoVideoRef.current.pause();
      demoVideoRef.current.currentTime = 0;
    }
  }, [testType, useUploadedVideo, userUploadedVideo]);

  // 初期化は状態の初期値で既に設定済みなので、このuseEffectは削除

  // デモ動画とアップロード動画の切り替え
  const toggleVideoSource = useCallback(() => {
    setUseUploadedVideo(prev => !prev);
  }, []);

  // 再生/一時停止トグル
  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) {
      console.log('Video ref is null');
      return;
    }
    
    const video = videoRef.current;
    console.log('Video state before action:', {
      paused: video.paused,
      currentTime: video.currentTime,
      duration: video.duration,
      readyState: video.readyState,
      src: video.src
    });
    
    try {
      if (isPlaying) {
        video.pause();
        console.log('Pause command sent');
        setStatusMessage('動画を一時停止しました');
      } else {
        console.log('Play command sending...');
        await video.play();
        console.log('Play command completed');
        setStatusMessage('動画を再生開始しました');
      }
    } catch (error) {
      console.error('動画再生エラー:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatusMessage(`動画再生エラー: ${errorMessage}`);
      setIsPlaying(false);
    }
  }, [isPlaying]);

  // 動画のロード完了時の処理
  const handleVideoLoaded = useCallback(() => {
    if (videoRef.current) {
      const video = videoRef.current;
      console.log('動画のロード完了:', {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        networkState: video.networkState,
        currentSrc: video.currentSrc
      });
      
      // ReadyState 2以上（HAVE_CURRENT_DATA）であることを確認
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        setIsVideoLoaded(true);
        setStatusMessage('動画読み込み完了 - 再生可能です');
      } else {
        console.warn('動画のメタデータが不完全:', {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight
        });
        setStatusMessage('動画メタデータ読み込み中...');
      }
    }
  }, []);

  // 比較表示の切り替え
  const toggleComparison = useCallback(() => {
    setShowComparison(prev => !prev);
  }, []);
  
  // グラフ表示の切り替え
  const toggleChart = useCallback(() => {
    setShowChart(prev => !prev);
  }, []);
  
  // 記録開始/停止の切り替え（手動制御）
  const toggleRecording = useCallback(() => {
    if (timeSeriesData.isRecording) {
      stopRecording();
      setStatusMessage('手動で記録を停止しました');
    } else {
      startRecording();
      setStatusMessage('手動で角度の記録を開始しました');
    }
  }, [timeSeriesData.isRecording, startRecording, stopRecording]);

  // ファイルアップロード用の隠しInput参照
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 動画の手動再読み込み
  const reloadVideo = useCallback(() => {
    if (videoRef.current) {
      console.log('Manual video reload triggered');
      setIsVideoLoaded(false);
      setVideoRetryCount(0);
      setStatusMessage('動画を手動で再読み込み中...');
      videoRef.current.load();
    }
  }, []);

  // JSXレンダリング部分
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">腰部運動制御評価アプリケーション</h1>
      
      {/* テストセレクター */}
      <TestSelector currentTest={testType} onChange={setTestType} />
      
      {/* メインコンテンツ */}
      <div className={`grid gap-6 ${
        showChart 
          ? 'grid-cols-1 xl:grid-cols-2' 
          : 'grid-cols-1 lg:grid-cols-3'
      }`}>
        {/* 左側: 動画と操作UIエリア */}
        <div className={showChart ? '' : 'lg:col-span-2'}>
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4">{TEST_LABELS[testType]}</h2>
            
            {/* 動画表示エリア */}
            <div className={`grid gap-4 mb-4 ${showComparison && userUploadedVideo ? 'grid-cols-1' : 'grid-cols-1'}`}>
              {/* メイン動画（アップロード動画または選択された動画） */}
              <div className="relative aspect-video bg-black rounded overflow-hidden">
                <div className="absolute top-2 left-2 z-20 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-sm">
                  {useUploadedVideo ? 'アップロード動画' : 'デモ動画'}
                </div>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain pointer-events-none"
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noremoteplayback"
                  webkit-playsinline="true"
                  x5-playsinline="true"
                  preload="metadata"
                  style={{ pointerEvents: 'none' }}
                  onLoadStart={() => {
                    console.log('Video load start event');
                    setIsVideoLoaded(false);
                    setStatusMessage('動画読み込み開始中...');
                  }}
                  onLoadedMetadata={() => {
                    console.log('Video metadata loaded');
                    setStatusMessage('動画メタデータ読み込み完了');
                  }}
                  onLoadedData={handleVideoLoaded}
                  onCanPlay={() => {
                    console.log('Video can play event');
                    if (videoRef.current) {
                      const video = videoRef.current;
                      if (video.readyState >= 3 && video.videoWidth > 0) {
                        setIsVideoLoaded(true);
                        setStatusMessage('動画準備完了 - 再生可能です');
                      }
                    }
                  }}
                  onCanPlayThrough={() => {
                    console.log('Video can play through event');
                    if (videoRef.current) {
                      const video = videoRef.current;
                      if (video.videoWidth > 0 && video.videoHeight > 0) {
                        setIsVideoLoaded(true);
                        setStatusMessage('動画準備完了 - 再生可能です');
                      }
                    }
                  }}
                  onPlay={() => {
                    console.log('Video play event triggered');
                    setIsPlaying(true);
                  }}
                  onPause={() => {
                    console.log('Video pause event triggered');
                    setIsPlaying(false);
                  }}
                  onEnded={() => {
                    console.log('Video ended event triggered');
                    setIsPlaying(false);
                  }}
                  onError={(e) => {
                    console.error('Video error:', e);
                    if (videoRef.current) {
                      const video = videoRef.current;
                      console.error('Video error details:', {
                        error: video.error,
                        networkState: video.networkState,
                        readyState: video.readyState,
                        currentSrc: video.currentSrc
                      });
                      
                      // 3回まで再試行
                      if (videoRetryCount < 3) {
                        console.log(`動画読み込み再試行中... (${videoRetryCount + 1}/3)`);
                        setVideoRetryCount(prev => prev + 1);
                        setStatusMessage(`動画読み込み再試行中... (${videoRetryCount + 1}/3)`);
                        
                        // 1秒後に再試行
                        setTimeout(() => {
                          video.load();
                        }, 1000);
                      } else {
                        setIsVideoLoaded(false);
                        setStatusMessage('動画の読み込みに失敗しました - 別の動画を試してください');
                      }
                    }
                  }}
                  onProgress={() => {
                    // バッファリング進捗の表示
                    if (videoRef.current) {
                      const buffered = videoRef.current.buffered;
                      if (buffered.length > 0) {
                        const bufferedEnd = buffered.end(buffered.length - 1);
                        const duration = videoRef.current.duration;
                        if (duration > 0) {
                          const bufferedPercent = (bufferedEnd / duration) * 100;
                          if (bufferedPercent < 100) {
                            setStatusMessage(`動画読み込み中... ${bufferedPercent.toFixed(0)}%`);
                          }
                        }
                      }
                    }
                  }}
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
              
              {/* デモ動画（比較表示時） */}
              {showComparison && userUploadedVideo && (
                <div className="relative aspect-video bg-black rounded overflow-hidden">
                  <div className="absolute top-2 left-2 z-20 bg-black bg-opacity-60 text-white px-2 py-1 rounded text-sm">
                    参考デモ動画
                  </div>
                  <video
                    ref={demoVideoRef}
                    src={DEMO_VIDEOS[testType]}
                    className="w-full h-full object-contain"
                    controls
                    playsInline
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    preload="metadata"
                    onLoadedData={() => {
                      console.log('Demo video loaded');
                      setIsDemoVideoLoaded(true);
                    }}
                    onPlay={() => {
                      console.log('Demo video play');
                    }}
                    onPause={() => {
                      console.log('Demo video pause');
                    }}
                    onEnded={() => {
                      console.log('Demo video ended');
                    }}
                  />
                  
                  {/* デモ動画のポーズ描画オーバーレイ */}
                  {isDemoVideoLoaded && demoLandmarks && (
                    <PoseVisualizer 
                      landmarks={demoLandmarks as NormalizedLandmark[][]} 
                      videoWidth={demoVideoRef.current?.videoWidth || 640}
                      videoHeight={demoVideoRef.current?.videoHeight || 480}
                    />
                  )}
                  
                  {/* デモ動画読み込み中表示 */}
                  {!isDemoVideoLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                      デモ動画読み込み中...
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* 動画コントロールエリア */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              {/* 再生/一時停止ボタン - スマホ対応でサイズアップ */}
              <button 
                className="flex items-center space-x-2 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-lg font-medium min-h-[48px]"
                onClick={togglePlayPause}
                disabled={!isVideoLoaded}
              >
                {isPlaying ? (
                  <>
                    <Pause size={20} />
                    <span>一時停止</span>
                  </>
                ) : (
                  <>
                    <Play size={20} />
                    <span>再生</span>
                  </>
                )}
              </button>
              
              <div className="flex flex-wrap gap-2">
                {/* デモ動画/アップロード動画切り替えボタン */}
                {userUploadedVideo && (
                  <button 
                    className={`px-3 py-2 rounded border text-sm ${
                      useUploadedVideo 
                        ? 'bg-gray-100 border-gray-400' 
                        : 'bg-white border-gray-300'
                    }`}
                    onClick={toggleVideoSource}
                  >
                    {useUploadedVideo ? 'デモ動画を表示' : 'アップロード動画を表示'}
                  </button>
                )}
                
                {/* 比較表示切り替えボタン */}
                {userUploadedVideo && (
                  <button 
                    className={`px-3 py-2 rounded border text-sm ${
                      showComparison 
                        ? 'bg-green-100 border-green-400 text-green-800' 
                        : 'bg-white border-gray-300'
                    }`}
                    onClick={toggleComparison}
                  >
                    {showComparison ? '縦並び表示中' : '縦並び表示'}
                  </button>
                )}
                
                {/* グラフ表示切り替えボタン */}
                <button 
                  className={`px-3 py-2 rounded border flex items-center space-x-1 text-sm ${
                    showChart 
                      ? 'bg-purple-100 border-purple-400 text-purple-800' 
                      : 'bg-white border-gray-300'
                  }`}
                  onClick={toggleChart}
                >
                  <BarChart3 size={16} />
                  <span>{showChart ? 'グラフ表示中' : 'グラフ表示'}</span>
                </button>
                
                {/* 記録開始/停止ボタン */}
                <button 
                  className={`px-3 py-2 rounded border flex items-center space-x-1 text-sm ${
                    timeSeriesData.isRecording 
                      ? 'bg-red-100 border-red-400 text-red-800' 
                      : 'bg-blue-100 border-blue-400 text-blue-800'
                  }`}
                  onClick={toggleRecording}
                  disabled={!isVideoLoaded}
                  title={isPlaying ? '自動記録中 - 手動での停止も可能' : '手動記録制御'}
                >
                  <Activity size={16} />
                  <span>
                    {timeSeriesData.isRecording 
                      ? (isPlaying ? '記録中（自動）' : '記録停止') 
                      : '手動記録開始'}
                  </span>
                </button>
                
                {/* 動画アップロードボタン */}
                <button 
                  className="px-3 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50 flex items-center space-x-1 text-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>動画をアップロード</span>
                </button>
                
                {/* 動画再読み込みボタン */}
                <button 
                  className="px-3 py-2 rounded border border-orange-300 bg-orange-50 hover:bg-orange-100 flex items-center space-x-1 text-sm text-orange-700"
                  onClick={reloadVideo}
                  title="動画が読み込めない場合に再試行"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                  <span>再読み込み</span>
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
            
            {/* ステータス表示 */}
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-sm text-gray-600 mb-1">
                <strong>実行状況:</strong> {statusMessage}
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>
                  メイン動画姿勢検出: {isModelLoaded ? '✓ 読み込み完了' : '⏳ 読み込み中...'}
                </div>
                {showComparison && userUploadedVideo && (
                  <div>
                    デモ動画姿勢検出: {isDemoReady ? '✓ 読み込み完了' : '⏳ 読み込み中...'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* 右側: 評価結果表示エリア */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4">評価結果</h2>
            
            {/* 評価指標の表示 */}
            {isVideoLoaded ? (
              <MetricsDisplay metrics={metrics} />
            ) : (
              <div className="text-center text-gray-500">
                <p className="mb-2">動画を再生すると評価結果が表示されます</p>
                {!isModelLoaded && (
                  <p className="text-sm">姿勢検出モデル読み込み中...</p>
                )}
              </div>
            )}
          </div>
          
          {/* 時系列グラフ表示 */}
          {showChart && (
            <LumbarAngleChartWithStats
              data={timeSeriesData.data}
              isRecording={timeSeriesData.isRecording}
              duration={timeSeriesData.duration}
              statistics={getStatistics()}
              onExport={exportData}
              onClear={clearData}
            />
          )}
        </div>
      </div>
      
      {/* フルスクリーングラフ表示（オプション） */}
      {showChart && timeSeriesData.data.length === 0 && (
        <div className="mt-6 bg-gray-50 p-8 rounded-lg text-center">
          <BarChart3 size={48} className="mx-auto mb-4 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">時系列グラフ</h3>
          <p className="text-gray-500">記録ボタンをクリックして腰椎角度の記録を開始してください</p>
        </div>
      )}
    </div>
  );
};

export default NewLumbarMotorControlApp;
