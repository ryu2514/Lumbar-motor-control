import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause, BarChart3, Activity } from 'lucide-react';

// MediaPipe の型定義（型の互換性の問題により直接使用せず）

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
  landmarks: any[][] | null;
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
            (!personLandmarks[start].visibility || personLandmarks[start].visibility > 0.5) &&
            (!personLandmarks[end].visibility || personLandmarks[end].visibility > 0.5)) {
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
        if (!landmark.visibility || landmark.visibility > 0.5) {
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
  const [loadingTimeout, setLoadingTimeout] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [preferredVideoFormat, setPreferredVideoFormat] = useState<'auto' | 'mp4' | 'webm'>('auto');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  
  // ビデオ要素への参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const demoVideoRef = useRef<HTMLVideoElement>(null);
  
  // デモ動画の状態管理
  const [isDemoVideoLoaded, setIsDemoVideoLoaded] = useState<boolean>(false);
  
  // ポーズ検出フックの利用
  const { result, isReady } = usePoseLandmarker(videoRef, isVideoLoaded);
  const { result: demoResult, isReady: isDemoReady } = usePoseLandmarker(demoVideoRef, isDemoVideoLoaded);
  
  // デモ動画のポーズ検出状況をログ出力
  useEffect(() => {
    console.log('🔍 Demo video pose detection state:', {
      isDemoVideoLoaded,
      isDemoReady,
      hasDemoResult: !!demoResult,
      hasLandmarks: !!demoResult?.landmarks,
      landmarksCount: demoResult?.landmarks?.length || 0
    });
  }, [isDemoVideoLoaded, isDemoReady, demoResult]);
  
  // デモ動画の初期化処理を一元管理
  const initializeDemoVideo = useCallback(() => {
    console.log('🎬 Initializing demo video...');
    setIsDemoVideoLoaded(false);
    
    // DOM要素が存在することを確認してから処理
    const checkAndInitialize = () => {
      if (demoVideoRef.current) {
        const video = demoVideoRef.current;
        console.log('🔄 Demo video initialization:', {
          src: video.src,
          currentSrc: video.currentSrc,
          readyState: video.readyState
        });
        
        // 確実にロード
        video.load();
        
        // 少し遅延してからプレイを試行
        setTimeout(() => {
          if (video.readyState >= 3) {
            video.play().catch(error => {
              console.log('Auto-play prevented:', error.message);
            });
          }
        }, 1000);
        
        return true;
      }
      return false;
    };
    
    // 最大3回まで試行
    let attempts = 0;
    const tryInitialize = () => {
      attempts++;
      if (checkAndInitialize()) {
        console.log('✅ Demo video initialization successful');
      } else if (attempts < 3) {
        console.log(`⏳ Demo video not ready, attempt ${attempts}/3`);
        setTimeout(tryInitialize, 500);
      } else {
        console.warn('❌ Demo video initialization failed after 3 attempts');
      }
    };
    
    // 200ms後に開始（DOM確実作成後）
    setTimeout(tryInitialize, 200);
  }, []);
  
  // 比較表示状態の変更を監視
  useEffect(() => {
    if (showComparison && userUploadedVideo) {
      console.log('🔄 Comparison view activated');
      initializeDemoVideo();
    }
  }, [showComparison, userUploadedVideo, initializeDemoVideo]);
  
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
      
      // 動画解析録画も自動開始
      if (!isRecording) {
        startVideoRecording();
      }
    } else if (!isPlaying && timeSeriesData.isRecording) {
      // 動画が停止されたら記録も停止
      console.log('Stopping auto recording...');
      stopRecording();
      setStatusMessage('動画停止 - 角度記録を停止しました');
      
      // 動画解析録画も停止（但し録画データは保持）
      if (isRecording) {
        stopVideoRecording();
      }
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
    
    // アップロード後デモ動画を初期化
    setTimeout(() => {
      console.log('📤 Video uploaded, initializing demo video...');
      initializeDemoVideo();
    }, 1500);
    
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
  }, [initializeDemoVideo]);

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
    
    // タイムアウトをクリア
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      setLoadingTimeout(null);
    }
    
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
        
        // タイムアウトをクリア
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
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
    setShowComparison(prev => {
      const newValue = !prev;
      console.log('🔄 Comparison toggle:', { from: prev, to: newValue });
      
      // 比較表示をONにする場合、デモ動画を初期化
      if (newValue && userUploadedVideo) {
        console.log('🔄 Toggling comparison ON - initializing demo video');
        setTimeout(() => {
          initializeDemoVideo();
        }, 300);
      }
      
      return newValue;
    });
  }, [userUploadedVideo, initializeDemoVideo]);
  
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
      
      // 既存のタイムアウトをクリア
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setLoadingTimeout(null);
      }
      
      videoRef.current.load();
    }
  }, [loadingTimeout]);
  
  // デモ動画の手動再読み込み
  const reloadDemoVideo = useCallback(() => {
    console.log('Manual demo video reload triggered');
    setStatusMessage('デモ動画を手動で再読み込み中...');
    initializeDemoVideo();
  }, [initializeDemoVideo]);
  
  // デモ動画を強制的に有効化（デバッグ用）
  const forceDemoVideoLoad = useCallback(() => {
    console.log('🚀 Force demo video load triggered');
    setIsDemoVideoLoaded(true);
    setStatusMessage('デモ動画を強制的に有効化しました');
  }, []);
  
  // デモ動画を手動で再生
  const playDemoVideo = useCallback(() => {
    if (demoVideoRef.current) {
      console.log('🎬 Manual demo video play triggered');
      demoVideoRef.current.play().then(() => {
        console.log('✅ Demo video manual play successful');
        setStatusMessage('デモ動画を手動で再生開始しました');
      }).catch((error) => {
        console.error('❌ Demo video manual play failed:', error);
        setStatusMessage('デモ動画の手動再生に失敗しました');
      });
    }
  }, []);

  // デバイス検出
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // WebMをMP4形式として保存（注意メッセージ付き）
  const saveAsMP4Format = useCallback(() => {
    if (!recordedVideoBlob) {
      alert('録画データがありません。');
      return;
    }

    // MP4形式として保存するための新しいBlob
    const mp4Blob = new Blob([recordedVideoBlob], { type: 'video/mp4' });
    
    try {
      const url = URL.createObjectURL(mp4Blob);
      const filename = `pose-analysis-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.mp4`;
      
      if (isMobile) {
        // モバイルデバイスの場合：新しいタブで開く
        console.log('📱 モバイルデバイス検出: 新しいタブで動画を開きます');
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>解析動画ダウンロード</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body { 
                    margin: 0; 
                    padding: 20px; 
                    font-family: Arial, sans-serif; 
                    background: #f5f5f5; 
                    text-align: center;
                  }
                  .container { 
                    max-width: 400px; 
                    margin: 0 auto; 
                    background: white; 
                    padding: 20px; 
                    border-radius: 10px; 
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  }
                  video { 
                    width: 100%; 
                    height: auto; 
                    border-radius: 8px; 
                    margin: 20px 0;
                  }
                  .download-btn {
                    background: #007AFF;
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    margin: 10px;
                    text-decoration: none;
                    display: inline-block;
                  }
                  .info {
                    color: #666;
                    font-size: 14px;
                    margin: 10px 0;
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <h2>解析動画</h2>
                  <video controls>
                    <source src="${url}" type="video/mp4">
                    お使いのブラウザは動画再生をサポートしていません。
                  </video>
                  <div class="info">
                    ファイル名: ${filename}<br>
                    サイズ: ${(mp4Blob.size / 1024 / 1024).toFixed(2)}MB
                  </div>
                  <a href="${url}" download="${filename}" class="download-btn">
                    動画をダウンロード
                  </a>
                  <div class="info">
                    ※ ダウンロードがうまくいかない場合は、動画を長押しして「動画を保存」を選択してください。
                  </div>
                </div>
              </body>
            </html>
          `);
          newWindow.document.close();
        } else {
          // ポップアップがブロックされた場合のフォールバック
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.textContent = 'ダウンロード';
          alert('新しいタブを開けませんでした。ダウンロードリンクをクリックしてください: ' + filename);
          document.body.appendChild(link);
          setTimeout(() => document.body.removeChild(link), 5000);
        }
      } else {
        // デスクトップの場合：従来の方法
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.setAttribute('download', filename);
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
          URL.revokeObjectURL(url);
        }, 1000);
      }
      
      setStatusMessage(`MP4形式で保存: ${filename} (${(mp4Blob.size / 1024 / 1024).toFixed(2)}MB)`);
    } catch (error) {
      console.error('❌ MP4保存エラー:', error);
      alert(`MP4保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [recordedVideoBlob, isMobile]);


  // 解析動画の録画開始
  // 即座ダウンロード機能（モバイル対応）
  const downloadRecordedVideo = useCallback(() => {
    console.log('🔽 ダウンロード開始:', { 
      hasBlob: !!recordedVideoBlob, 
      blobSize: recordedVideoBlob?.size,
      blobType: recordedVideoBlob?.type,
      isMobile
    });
    
    if (!recordedVideoBlob) {
      console.error('❌ 録画データがありません');
      alert('まだ録画されたデータがありません。動画を再生してから試してください。');
      return;
    }

    if (recordedVideoBlob.size === 0) {
      console.error('❌ 録画データのサイズが0です');
      alert('録画データが空です。動画を再生してから再試行してください。');
      return;
    }

    try {
      // ユーザーの希望に応じてファイル拡張子を設定
      const getFileExtension = (mimeType: string, preferredFormat: string) => {
        // MP4が希望されている場合は強制的にMP4拡張子を使用
        if (preferredFormat === 'mp4') return 'mp4';
        
        // それ以外は実際のMIMEタイプに基づく
        if (mimeType.includes('mp4')) return 'mp4';
        if (mimeType.includes('webm')) return 'webm';
        if (mimeType.includes('avi')) return 'avi';
        if (mimeType.includes('mov')) return 'mov';
        return 'webm'; // デフォルト
      };
      
      const extension = getFileExtension(recordedVideoBlob.type, preferredVideoFormat);
      const filename = `pose-analysis-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
      
      console.log('📁 ダウンロードファイル名:', filename);
      
      if (isMobile) {
        // モバイルの場合：MP4形式として保存
        const adjustedBlob = extension === 'mp4' 
          ? new Blob([recordedVideoBlob], { type: 'video/mp4' })
          : recordedVideoBlob;
        
        const url = URL.createObjectURL(adjustedBlob);
        
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>解析動画ダウンロード</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f5f5f5; text-align: center; }
                  .container { max-width: 400px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                  video { width: 100%; height: auto; border-radius: 8px; margin: 20px 0; }
                  .download-btn { background: #007AFF; color: white; border: none; padding: 15px 30px; border-radius: 8px; font-size: 16px; cursor: pointer; margin: 10px; text-decoration: none; display: inline-block; }
                  .info { color: #666; font-size: 14px; margin: 10px 0; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h2>解析動画 (${extension.toUpperCase()}形式)</h2>
                  <video controls>
                    <source src="${url}" type="video/${extension}">
                    お使いのブラウザは動画再生をサポートしていません。
                  </video>
                  <div class="info">
                    ファイル名: ${filename}<br>
                    サイズ: ${(adjustedBlob.size / 1024 / 1024).toFixed(2)}MB
                  </div>
                  <a href="${url}" download="${filename}" class="download-btn">
                    動画をダウンロード
                  </a>
                  <div class="info">
                    ※ ダウンロードがうまくいかない場合は、動画を長押しして「動画を保存」を選択してください。
                  </div>
                </div>
              </body>
            </html>
          `);
          newWindow.document.close();
        }
      } else {
        // デスクトップの場合：従来の方法
        const url = URL.createObjectURL(recordedVideoBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.setAttribute('download', filename);
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          if (document.body.contains(a)) {
            document.body.removeChild(a);
          }
          URL.revokeObjectURL(url);
        }, 1000);
      }
      
      setStatusMessage(`解析動画のダウンロードを開始しました (${extension.toUpperCase()}): ${filename}`);
      
    } catch (error) {
      console.error('❌ ダウンロードエラー:', error);
      alert(`ダウンロードに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [recordedVideoBlob, preferredVideoFormat, isMobile]);

  const startVideoRecording = useCallback(async () => {
    if (!videoRef.current) {
      alert('動画が読み込まれていません');
      return;
    }

    try {
      // 動画要素を取得
      const video = videoRef.current;

      // 合成用のキャンバスを作成
      const compositeCanvas = document.createElement('canvas');
      const ctx = compositeCanvas.getContext('2d');
      
      if (!ctx) {
        alert('キャンバスの初期化に失敗しました');
        return;
      }

      // キャンバスサイズを動画に合わせる
      compositeCanvas.width = video.videoWidth || 640;
      compositeCanvas.height = video.videoHeight || 480;

      // MediaRecorderでキャンバスストリームを録画
      const stream = compositeCanvas.captureStream(30); // 30fps
      
      // サポートされているMIMEタイプを確認
      const getPreferredMimeType = () => {
        // より広範囲のMP4形式をテスト
        const mp4Types = [
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/mp4; codecs="avc1.42E01E"',
          'video/mp4; codecs=h264',
          'video/mp4; codecs="h264"',
          'video/mp4'
        ];
        
        const webmTypes = [
          'video/webm; codecs=vp9',
          'video/webm; codecs=vp8',
          'video/webm'
        ];
        
        console.log('🔍 MediaRecorder サポート状況:');
        [...mp4Types, ...webmTypes].forEach(type => {
          console.log(`  ${type}: ${MediaRecorder.isTypeSupported(type) ? '✓' : '✗'}`);
        });
        
        // ユーザーの希望形式に基づいて優先順位を決定
        if (preferredVideoFormat === 'mp4') {
          // MP4を優先
          for (const type of mp4Types) {
            if (MediaRecorder.isTypeSupported(type)) {
              console.log(`✅ MP4形式選択: ${type}`);
              return type;
            }
          }
          console.warn('⚠️ MP4がサポートされていません。WebMにフォールバック');
          // MP4がサポートされていない場合はWebMにフォールバック
          for (const type of webmTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              return type;
            }
          }
        } else if (preferredVideoFormat === 'webm') {
          // WebMを優先
          for (const type of webmTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              console.log(`✅ WebM形式選択: ${type}`);
              return type;
            }
          }
          // WebMがサポートされていない場合はMP4にフォールバック
          for (const type of mp4Types) {
            if (MediaRecorder.isTypeSupported(type)) {
              return type;
            }
          }
        } else {
          // auto: 最適な形式を自動選択（MP4を優先）
          for (const type of mp4Types) {
            if (MediaRecorder.isTypeSupported(type)) {
              console.log(`✅ 自動選択(MP4): ${type}`);
              return type;
            }
          }
          for (const type of webmTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
              console.log(`✅ 自動選択(WebM): ${type}`);
              return type;
            }
          }
        }
        
        console.warn('⚠️ フォールバック: video/webm');
        return 'video/webm'; // フォールバック
      };
      
      const selectedMimeType = getPreferredMimeType();
      
      console.log('🎥 Starting video recording with pose overlay...', {
        videoWidth: compositeCanvas.width,
        videoHeight: compositeCanvas.height,
        hasLandmarks: !!(landmarks && landmarks.length > 0),
        landmarksCount: landmarks?.length || 0,
        selectedMimeType,
        preferredFormat: preferredVideoFormat,
        isMP4: selectedMimeType.includes('mp4'),
        isWebM: selectedMimeType.includes('webm'),
        poseResult: {
          hasResult: !!result,
          hasLandmarks: !!result?.landmarks,
          landmarksLength: result?.landmarks?.length || 0,
          isModelLoaded
        }
      });
      
      // ポーズ検出の詳細状況をログ
      if (result && result.landmarks) {
        console.log('📍 ポーズ検出詳細:', {
          総人数: result.landmarks.length,
          各人のランドマーク数: result.landmarks.map((person, i) => ({
            人: i + 1,
            ランドマーク数: person.length,
            サンプルランドマーク: person[0] ? {
              x: person[0].x,
              y: person[0].y,
              visibility: person[0].visibility
            } : null
          }))
        });
      } else {
        console.warn('⚠️ 録画開始時にポーズデータがありません');
      }
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType: selectedMimeType 
      });
      
      // recordingChunksRef.current を初期化
      recordingChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('📹 Recording stopped, saving video data...', {
          chunks: recordingChunksRef.current.length,
          totalSize: recordingChunksRef.current.reduce((total, chunk) => total + chunk.size, 0)
        });
        
        if (recordingChunksRef.current.length === 0) {
          console.warn('⚠️ 録画チャンクが空です');
          setStatusMessage('録画データが見つかりません');
          setIsRecording(false);
          return;
        }
        
        const blob = new Blob(recordingChunksRef.current, { type: selectedMimeType });
        console.log('📹 ビデオBlob作成:', {
          size: blob.size,
          type: blob.type,
          chunks: recordingChunksRef.current.length
        });
        
        setRecordedVideoBlob(blob);
        setStatusMessage(`解析動画の準備が完了しました (${(blob.size / 1024 / 1024).toFixed(2)}MB)`);
        setIsRecording(false);
        recordingChunksRef.current = []; // チャンクをクリア
      };

      mediaRecorder.onerror = (event) => {
        console.error('📹 Recording error:', event);
        setStatusMessage('録画エラーが発生しました');
        setIsRecording(false);
      };

      // ポーズ描画関数（録画用）- 強化版
      const drawPoseOnCanvas = (ctx: CanvasRenderingContext2D, landmarks: any[][], width: number, height: number) => {
        if (!landmarks || landmarks.length === 0) {
          console.warn('drawPoseOnCanvas: ランドマークデータがありません');
          return;
        }
        
        console.log('🎨 drawPoseOnCanvas 実行:', {
          人数: landmarks.length,
          canvasSize: { width, height },
          最初の人のランドマーク数: landmarks[0]?.length || 0
        });
        
        // 各人物のポーズを描画
        landmarks.forEach((personLandmarks, personIndex) => {
          if (!personLandmarks || personLandmarks.length === 0) {
            console.warn(`Person ${personIndex}: ランドマークがありません`);
            return;
          }
          
          console.log(`Person ${personIndex}: ${personLandmarks.length}個のランドマーク`);
          
          // 人物ごとに異なる色を使用
          const colors = [
            { line: 'rgba(0, 255, 0, 0.9)', point: 'rgba(255, 0, 0, 0.9)' },
            { line: 'rgba(0, 0, 255, 0.9)', point: 'rgba(255, 255, 0, 0.9)' },
            { line: 'rgba(255, 0, 255, 0.9)', point: 'rgba(0, 255, 255, 0.9)' }
          ];
          const color = colors[personIndex % colors.length];
          
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
          ctx.strokeStyle = color.line;
          ctx.lineWidth = 3; // 太くして見やすく
          ctx.lineCap = 'round';

          let drawnConnections = 0;
          connections.forEach(([start, end]) => {
            if (start < personLandmarks.length && end < personLandmarks.length &&
                personLandmarks[start] && personLandmarks[end]) {
              
              const startLandmark = personLandmarks[start];
              const endLandmark = personLandmarks[end];
              
              // 可視性チェック（より寛容に）
              const startVisible = !startLandmark.visibility || startLandmark.visibility > 0.3;
              const endVisible = !endLandmark.visibility || endLandmark.visibility > 0.3;
              
              if (startVisible && endVisible) {
                ctx.beginPath();
                ctx.moveTo(
                  startLandmark.x * width,
                  startLandmark.y * height
                );
                ctx.lineTo(
                  endLandmark.x * width,
                  endLandmark.y * height
                );
                ctx.stroke();
                drawnConnections++;
              }
            }
          });

          // ランドマーク（点）を描画
          ctx.fillStyle = color.point;
          let drawnPoints = 0;
          personLandmarks.forEach((landmark: any, index: number) => {
            if (!landmark) return;
            
            const x = landmark.x * width;
            const y = landmark.y * height;
            
            // 画面内チェック
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              // 可視性チェック（より寛容に）
              const visible = !landmark.visibility || landmark.visibility > 0.3;
              
              if (visible) {
                ctx.beginPath();
                ctx.arc(x, y, 6, 0, 2 * Math.PI); // 大きくして見やすく
                ctx.fill();
                
                // 重要なポイントにはアウトライン追加
                if ([0, 11, 12, 23, 24].includes(index)) { // 鼻、肩、腰
                  ctx.strokeStyle = 'white';
                  ctx.lineWidth = 2;
                  ctx.stroke();
                }
                
                drawnPoints++;
              }
            }
          });
          
          console.log(`Person ${personIndex}: 描画完了 - 線:${drawnConnections}, 点:${drawnPoints}`);
        });
      };

      // 確実にポーズを描画するための改善された描画ループ
      let frameCount = 0;
      let lastLandmarksData: any[][] | null = null;
      
      const drawFrame = () => {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        
        try {
          frameCount++;
          
          // キャンバスをクリア
          ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
          
          // 動画フレームを描画
          ctx.drawImage(video, 0, 0, compositeCanvas.width, compositeCanvas.height);
          
          // 複数のソースからポーズデータを取得試行
          let currentLandmarks = null;
          
          // 1. 最新のresultから取得
          if (result && result.landmarks && result.landmarks.length > 0) {
            currentLandmarks = result.landmarks;
            lastLandmarksData = currentLandmarks; // 成功時に保存
          }
          // 2. 前回のデータがある場合は継続使用
          else if (lastLandmarksData) {
            currentLandmarks = lastLandmarksData;
          }
          
          // ポーズ描画
          if (currentLandmarks && currentLandmarks.length > 0) {
            if (frameCount % 30 === 0) { // 1秒に1回ログ出力
              console.log('🎨 録画中ポーズ描画:', {
                人数: currentLandmarks.length,
                フレーム: frameCount,
                ランドマーク数: currentLandmarks[0]?.length || 0,
                最初のランドマーク: currentLandmarks[0]?.[0] || null
              });
            }
            
            // ポーズ描画を実行
            try {
              drawPoseOnCanvas(ctx, currentLandmarks, compositeCanvas.width, compositeCanvas.height);
              
              // 成功を示すテキスト
              ctx.fillStyle = 'lime';
              ctx.font = 'bold 14px Arial';
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 1;
              ctx.strokeText(`✓ ポーズ描画中: ${currentLandmarks.length}人`, 10, 70);
              ctx.fillText(`✓ ポーズ描画中: ${currentLandmarks.length}人`, 10, 70);
            } catch (poseError) {
              console.error('ポーズ描画エラー:', poseError);
              ctx.fillStyle = 'red';
              ctx.font = '14px Arial';
              ctx.fillText('ポーズ描画エラー', 10, 70);
            }
          } else {
            if (frameCount % 30 === 0) { // 1秒に1回ログ出力
              console.log('⚠️ 録画中ポーズなし:', {
                フレーム: frameCount,
                result: !!result,
                landmarks: !!result?.landmarks,
                landmarksLength: result?.landmarks?.length || 0
              });
            }
            
            // ポーズ未検出を画面に表示
            ctx.fillStyle = 'orange';
            ctx.font = '14px Arial';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.strokeText('⚠ ポーズ未検出', 10, 70);
            ctx.fillText('⚠ ポーズ未検出', 10, 70);
          }
          
          // デバッグ用情報を追加
          ctx.fillStyle = 'red';
          ctx.font = 'bold 16px Arial';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          ctx.strokeText('🔴 REC', 10, 30);
          ctx.fillText('🔴 REC', 10, 30);
          
          // フレーム番号とタイムスタンプ
          ctx.fillStyle = 'blue';
          ctx.font = '12px Arial';
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1;
          const timestamp = new Date().toLocaleTimeString();
          ctx.strokeText(`Frame: ${frameCount} | ${timestamp}`, 10, 50);
          ctx.fillText(`Frame: ${frameCount} | ${timestamp}`, 10, 50);
          
          // デバッグ: カラフルな枠線を追加して録画が動作していることを確認
          ctx.strokeStyle = `hsl(${frameCount % 360}, 100%, 50%)`;
          ctx.lineWidth = 4;
          ctx.strokeRect(2, 2, compositeCanvas.width - 4, compositeCanvas.height - 4);
          
        } catch (error) {
          console.error('フレーム描画エラー:', error);
          
          // エラー情報を画面に表示
          ctx.fillStyle = 'red';
          ctx.font = '14px Arial';
          ctx.fillText('描画エラー発生', 10, 90);
        }
        
        requestAnimationFrame(drawFrame);
      };

      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
      mediaRecorder.start();
      drawFrame();
      
      const hasPoser = !!(landmarks && landmarks.length > 0);
      setStatusMessage(`解析動画の自動録画を開始しました（ポーズ検出: ${hasPoser ? 'あり' : 'なし'}）`);
      
    } catch (error) {
      console.error('Recording error:', error);
      alert('録画の開始に失敗しました');
      setIsRecording(false);
    }
  }, []);

  // 解析動画の録画停止
  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 Stopping video recording...');
      mediaRecorderRef.current.stop();
      setStatusMessage('解析動画の録画を停止しています...');
    }
  }, [isRecording]);

  // 解析データをダウンロード
  const downloadAnalysisData = useCallback(() => {
    console.log('📊 解析データダウンロード開始');
    const statistics = getStatistics();
    
    if (!statistics || timeSeriesData.data.length === 0) {
      console.error('❌ 解析データが不足');
      alert('解析データがありません。動画を再生して記録を開始してください。');
      return;
    }

    try {
      // 解析データオブジェクトを作成
      const analysisData = {
        testType,
        testLabel: TEST_LABELS[testType],
        timestamp: new Date().toISOString(),
        duration: timeSeriesData.duration,
        recordingInfo: {
          isRecording: timeSeriesData.isRecording,
          dataPoints: timeSeriesData.data.length,
          startTime: timeSeriesData.data.length > 0 ? timeSeriesData.data[0].timestamp : null,
          endTime: timeSeriesData.data.length > 0 ? timeSeriesData.data[timeSeriesData.data.length - 1].timestamp : null
        },
        statistics: {
          mean: statistics.mean,
          min: statistics.min,
          max: statistics.max,
          range: statistics.range,
          normalPercentage: statistics.normalPercentage,
          cautionPercentage: statistics.cautionPercentage,
          abnormalPercentage: statistics.abnormalPercentage
        },
        rawData: timeSeriesData.data.map(point => ({
          timestamp: point.timestamp,
          time: point.time,
          lumbarAngle: point.lumbarAngle,
          status: point.status,
          relativeTime: point.timestamp - (timeSeriesData.data[0]?.timestamp || 0)
        })),
        currentMetrics: metrics.map(metric => ({
          label: metric.label,
          value: metric.value,
          unit: metric.unit,
          normalRange: metric.normalRange,
          status: metric.status,
          description: metric.description
        })),
        videoInfo: {
          hasUploadedVideo: !!userUploadedVideo,
          useUploadedVideo,
          videoWidth: videoRef.current?.videoWidth || 0,
          videoHeight: videoRef.current?.videoHeight || 0,
          videoUrl: useUploadedVideo ? 'user_uploaded' : DEMO_VIDEOS[testType]
        }
      };

      console.log('📊 解析データ作成完了:', {
        dataPoints: analysisData.recordingInfo.dataPoints,
        testType: analysisData.testType,
        statisticsKeys: Object.keys(analysisData.statistics)
      });

      // JSONデータをBlobとして作成
      const jsonData = JSON.stringify(analysisData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      console.log('📄 JSONブロブ作成:', {
        size: blob.size,
        type: blob.type
      });
      
      // ダウンロードリンクを作成
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `lumbar-analysis-${testType}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      
      a.href = url;
      a.download = filename;
      a.setAttribute('download', filename);
      a.style.display = 'none';
      
      document.body.appendChild(a);
      
      console.log('🖱️ JSONダウンロードクリック実行');
      
      // ブラウザ互換性のための複数の試行
      try {
        a.click();
      } catch (clickError) {
        console.warn('⚠️ JSON通常のクリックが失敗、MouseEventで再試行');
        const event = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        a.dispatchEvent(event);
      }
      
      setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
        console.log('🧹 JSON クリーンアップ完了');
      }, 1000);
      
      setStatusMessage(`解析データのダウンロードを開始しました: ${filename}`);
      
    } catch (error) {
      console.error('❌ 解析データダウンロードエラー:', error);
      alert(`解析データのダウンロードに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [testType, timeSeriesData, getStatistics, metrics, userUploadedVideo, useUploadedVideo]);

  // すべての解析結果をまとめてダウンロード
  const downloadAllAnalysisResults = useCallback(() => {
    const statistics = getStatistics();
    
    if (!statistics || timeSeriesData.data.length === 0) {
      alert('解析データがありません。動画を再生して記録を開始してください。');
      return;
    }

    if (!recordedVideoBlob) {
      alert('解析動画がありません。動画を再生してから試してください。');
      return;
    }

    // 解析データをダウンロード
    downloadAnalysisData();
    
    // 少し遅延してから解析動画をダウンロード
    setTimeout(() => {
      downloadRecordedVideo();
    }, 500);
    
    setStatusMessage('すべての解析結果のダウンロードを開始しました');
  }, [downloadAnalysisData, downloadRecordedVideo, getStatistics, timeSeriesData, recordedVideoBlob]);

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
                    
                    // 既存のタイムアウトをクリア
                    if (loadingTimeout) {
                      clearTimeout(loadingTimeout);
                    }
                    
                    // 30秒後にタイムアウト
                    const timeoutId = window.setTimeout(() => {
                      if (!isVideoLoaded) {
                        console.warn('⏰ Video loading timeout');
                        setStatusMessage('動画読み込みがタイムアウトしました - 再読み込みボタンをお試しください');
                      }
                    }, 30000);
                    
                    setLoadingTimeout(timeoutId);
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
                        
                        // タイムアウトをクリア
                        if (loadingTimeout) {
                          clearTimeout(loadingTimeout);
                          setLoadingTimeout(null);
                        }
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
                        
                        // タイムアウトをクリア
                        if (loadingTimeout) {
                          clearTimeout(loadingTimeout);
                          setLoadingTimeout(null);
                        }
                      }
                    }
                  }}
                  onPlay={() => {
                    console.log('Video play event triggered');
                    setIsPlaying(true);
                    
                    // メイン動画が再生開始されたらデモ動画も再生
                    if (showComparison && userUploadedVideo && demoVideoRef.current && isDemoVideoLoaded) {
                      setTimeout(() => {
                        demoVideoRef.current?.play().then(() => {
                          console.log('🎬 Demo video synced with main video play');
                        }).catch((error) => {
                          console.log('⚠️ Demo video sync play failed:', error.message);
                        });
                      }, 100);
                    }
                  }}
                  onPause={() => {
                    console.log('Video pause event triggered');
                    setIsPlaying(false);
                    
                    // メイン動画が一時停止されたらデモ動画も一時停止
                    if (showComparison && userUploadedVideo && demoVideoRef.current) {
                      demoVideoRef.current.pause();
                      console.log('⏸️ Demo video synced with main video pause');
                    }
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
                {isVideoLoaded && landmarks && landmarks.length > 0 && (
                  <PoseVisualizer 
                    landmarks={landmarks} 
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
                    {isDemoVideoLoaded ? ' ✓' : ' ⏳'}
                  </div>
                  <video
                    key={`demo-${testType}-${showComparison}`}
                    ref={demoVideoRef}
                    src={DEMO_VIDEOS[testType]}
                    className="w-full h-full object-contain"
                    controls
                    muted
                    autoPlay
                    loop
                    playsInline
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    webkit-playsinline="true"
                    x5-playsinline="true"
                    preload="auto"
                    onLoadedData={() => {
                      console.log('Demo video onLoadedData');
                      if (demoVideoRef.current) {
                        const video = demoVideoRef.current;
                        console.log('Demo video load details:', {
                          readyState: video.readyState,
                          videoWidth: video.videoWidth,
                          videoHeight: video.videoHeight,
                          duration: video.duration,
                          networkState: video.networkState
                        });
                        
                        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                          setIsDemoVideoLoaded(true);
                          console.log('✅ Demo video successfully loaded');
                          
                          // 自動再生を試行（ユーザーインタラクションが必要な場合はcatchで処理）
                          setTimeout(() => {
                            video.play().then(() => {
                              console.log('🎬 Demo video auto-play started');
                            }).catch((error) => {
                              console.log('⚠️ Demo video auto-play prevented (user interaction required):', error.message);
                            });
                          }, 500);
                        }
                      }
                    }}
                    onCanPlay={() => {
                      console.log('Demo video can play');
                      if (demoVideoRef.current) {
                        const video = demoVideoRef.current;
                        if (video.readyState >= 3 && video.videoWidth > 0) {
                          setIsDemoVideoLoaded(true);
                          console.log('✅ Demo video ready to play');
                          
                          // 自動再生を試行
                          setTimeout(() => {
                            video.play().then(() => {
                              console.log('🎬 Demo video auto-play from canPlay');
                            }).catch((error) => {
                              console.log('⚠️ Demo video auto-play prevented from canPlay:', error.message);
                            });
                          }, 200);
                        }
                      }
                    }}
                    onCanPlayThrough={() => {
                      console.log('Demo video can play through');
                      if (demoVideoRef.current) {
                        const video = demoVideoRef.current;
                        if (video.videoWidth > 0 && video.videoHeight > 0) {
                          setIsDemoVideoLoaded(true);
                          console.log('✅ Demo video fully loaded');
                          
                          // 自動再生を試行
                          setTimeout(() => {
                            video.play().then(() => {
                              console.log('🎬 Demo video auto-play from canPlayThrough');
                            }).catch((error) => {
                              console.log('⚠️ Demo video auto-play prevented from canPlayThrough:', error.message);
                            });
                          }, 100);
                        }
                      }
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
                    onError={(e) => {
                      console.error('Demo video error:', e);
                      if (demoVideoRef.current) {
                        const video = demoVideoRef.current;
                        console.error('Demo video error details:', {
                          error: video.error,
                          networkState: video.networkState,
                          readyState: video.readyState,
                          currentSrc: video.currentSrc
                        });
                      }
                      setIsDemoVideoLoaded(false);
                    }}
                    onLoadStart={() => {
                      console.log('Demo video load start');
                      setIsDemoVideoLoaded(false);
                    }}
                  />
                  
                  {/* デモ動画のポーズ描画オーバーレイ */}
                  {isDemoVideoLoaded && demoLandmarks && demoLandmarks.length > 0 && (
                    <PoseVisualizer 
                      landmarks={demoLandmarks} 
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
            <div className="space-y-4 mb-6">
              {/* メイン操作ボタン */}
              <div className="flex flex-wrap items-center gap-3">
                {/* 再生/一時停止ボタン */}
                <button 
                  className="flex items-center space-x-2 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-lg font-medium min-h-[48px] shadow-sm"
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
                
                {/* 動画アップロードボタン */}
                <button 
                  className="px-4 py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={18} />
                  <span>動画をアップロード</span>
                </button>
                
                {/* 記録ボタン */}
                <button 
                  className={`px-4 py-3 rounded-lg border flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] ${
                    timeSeriesData.isRecording 
                      ? 'bg-red-100 border-red-400 text-red-800' 
                      : 'bg-blue-100 border-blue-400 text-blue-800'
                  }`}
                  onClick={toggleRecording}
                  disabled={!isVideoLoaded}
                  title={isPlaying ? '自動記録中 - 手動での停止も可能' : '手動記録制御'}
                >
                  <Activity size={18} />
                  <span>
                    {timeSeriesData.isRecording 
                      ? (isPlaying ? '記録中' : '記録停止') 
                      : '記録開始'}
                  </span>
                </button>
                
                {/* 動画再読み込みボタン */}
                <button 
                  className="px-4 py-3 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] text-orange-700"
                  onClick={reloadVideo}
                  title="動画が読み込めない場合に再試行"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                  <span>再読み込み</span>
                </button>
                
                {/* 解析動画録画ボタン */}
                <button 
                  className={`px-4 py-3 rounded-lg border flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] ${
                    isRecording 
                      ? 'bg-red-100 border-red-400 text-red-800' 
                      : 'bg-green-100 border-green-400 text-green-800'
                  }`}
                  onClick={downloadRecordedVideo}
                  disabled={!recordedVideoBlob}
                  title={recordedVideoBlob ? '解析動画をすぐにダウンロード' : '動画を再生すると自動録画されダウンロード可能になります'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>
                    {recordedVideoBlob 
                      ? `解析動画ダウンロード (${(recordedVideoBlob.size / 1024 / 1024).toFixed(2)}MB, ${recordedVideoBlob.type.includes('mp4') ? 'MP4' : 'WebM'})` 
                      : `録画準備中... (${preferredVideoFormat === 'auto' ? 'MP4優先' : preferredVideoFormat.toUpperCase()})`}
                  </span>
                </button>
                
                {/* MP4形式ダウンロードボタン */}
                {recordedVideoBlob && !recordedVideoBlob.type.includes('mp4') && (
                  <button 
                    className="px-4 py-3 rounded-lg border border-purple-400 bg-purple-100 hover:bg-purple-200 flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] text-purple-800"
                    onClick={saveAsMP4Format}
                    title="録画された動画をMP4形式として保存"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7,10 12,15 17,10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                      <polygon points="9,11 15,11 15,13 9,13"/>
                    </svg>
                    <span>{isMobile ? 'MP4で表示・保存' : 'MP4形式で保存'}</span>
                  </button>
                )}
                
                {/* 解析データダウンロードボタン */}
                <button 
                  className="px-4 py-3 rounded-lg border border-blue-400 bg-blue-100 hover:bg-blue-200 flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] text-blue-800"
                  onClick={downloadAnalysisData}
                  disabled={timeSeriesData.data.length === 0}
                  title={timeSeriesData.data.length > 0 ? '解析データ（JSON）をダウンロード' : '動画を再生して記録を開始してください'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  <span>{timeSeriesData.data.length > 0 ? '解析データ(JSON)' : 'データ記録待ち'}</span>
                </button>
                
                {/* すべての解析結果ダウンロードボタン */}
                <button 
                  className="px-4 py-3 rounded-lg border border-purple-400 bg-purple-100 hover:bg-purple-200 flex items-center space-x-2 text-sm font-medium shadow-sm min-h-[48px] text-purple-800"
                  onClick={downloadAllAnalysisResults}
                  disabled={!recordedVideoBlob || timeSeriesData.data.length === 0}
                  title={recordedVideoBlob && timeSeriesData.data.length > 0 ? '解析動画とデータをまとめてダウンロード' : '動画を再生して記録してください'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span>{recordedVideoBlob && timeSeriesData.data.length > 0 ? 'すべてダウンロード' : '準備中...'}</span>
                </button>
              </div>

              {/* 録画設定 */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm text-gray-600 font-medium mr-2">録画形式:</span>
                
                <select 
                  value={preferredVideoFormat}
                  onChange={(e) => setPreferredVideoFormat(e.target.value as 'auto' | 'mp4' | 'webm')}
                  className="px-3 py-1 rounded border border-gray-300 text-sm bg-white"
                >
                  <option value="auto">自動選択 (MP4優先)</option>
                  <option value="mp4">MP4形式</option>
                  <option value="webm">WebM形式</option>
                </select>
                
                <span className="text-xs text-gray-500">
                  {(() => {
                    const mp4Supported = MediaRecorder.isTypeSupported('video/mp4') || 
                                       MediaRecorder.isTypeSupported('video/mp4; codecs="avc1.42E01E"') ||
                                       MediaRecorder.isTypeSupported('video/mp4; codecs=h264');
                    const webmSupported = MediaRecorder.isTypeSupported('video/webm');
                    
                    if (preferredVideoFormat === 'mp4') {
                      return mp4Supported ? '✓ MP4ネイティブ対応' : '⚠ MP4非対応(拡張子変更で保存)';
                    } else if (preferredVideoFormat === 'webm') {
                      return webmSupported ? '✓ WebM対応' : '⚠ WebM非対応';
                    } else {
                      return mp4Supported ? '✓ MP4優先' : webmSupported ? '✓ WebM使用' : '⚠ 制限あり';
                    }
                  })()}
                </span>
              </div>

              {/* 表示オプション */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 font-medium mr-2">表示オプション:</span>
                
                {userUploadedVideo && (
                  <>
                    <button 
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        useUploadedVideo 
                          ? 'bg-gray-100 border-gray-400' 
                          : 'bg-white border-gray-300'
                      }`}
                      onClick={toggleVideoSource}
                    >
                      {useUploadedVideo ? 'デモ動画を表示' : 'アップロード動画を表示'}
                    </button>
                    
                    <button 
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        showComparison 
                          ? 'bg-green-100 border-green-400 text-green-800' 
                          : 'bg-white border-gray-300'
                      }`}
                      onClick={toggleComparison}
                    >
                      {showComparison ? '縦並び表示中' : '縦並び表示'}
                    </button>
                  </>
                )}
                
                <button 
                  className={`px-3 py-2 rounded-lg border flex items-center space-x-1 text-sm ${
                    showChart 
                      ? 'bg-purple-100 border-purple-400 text-purple-800' 
                      : 'bg-white border-gray-300'
                  }`}
                  onClick={toggleChart}
                >
                  <BarChart3 size={16} />
                  <span>{showChart ? 'グラフ表示中' : 'グラフ表示'}</span>
                </button>
              </div>

              {/* デバッグ・メンテナンス */}
              <details className="bg-gray-50 rounded-lg p-3">
                <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800 font-medium">
                  トラブルシューティング・詳細設定
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {showComparison && userUploadedVideo && (
                    <>
                      <button 
                        className="px-3 py-2 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 flex items-center space-x-1 text-sm text-blue-700"
                        onClick={reloadDemoVideo}
                        title="デモ動画再読み込み"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                          <path d="M21 3v5h-5"/>
                          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                          <path d="M3 21v-5h5"/>
                        </svg>
                        <span>デモ動画再読み込み</span>
                      </button>
                      
                      <button 
                        className="px-3 py-2 rounded border border-green-300 bg-green-50 hover:bg-green-100 flex items-center space-x-1 text-sm text-green-700"
                        onClick={forceDemoVideoLoad}
                        title="デモ動画を強制的に有効化"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4"/>
                          <circle cx="12" cy="12" r="9"/>
                        </svg>
                        <span>デモ動画強制有効</span>
                      </button>
                      
                      <button 
                        className="px-3 py-2 rounded border border-purple-300 bg-purple-50 hover:bg-purple-100 flex items-center space-x-1 text-sm text-purple-700"
                        onClick={playDemoVideo}
                        title="デモ動画を手動で再生"
                        disabled={!isDemoVideoLoaded}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="5,3 19,12 5,21"/>
                        </svg>
                        <span>デモ動画手動再生</span>
                      </button>
                    </>
                  )}
                </div>
              </details>
              
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
            
            {/* ステータス表示 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <h3 className="text-sm font-semibold text-gray-800">システム状況</h3>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">動画状態:</span>
                  <div className="flex items-center space-x-2">
                    {!isVideoLoaded && statusMessage.includes('読み込み') && (
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                    )}
                    {statusMessage.includes('タイムアウト') && (
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    )}
                    {isVideoLoaded && (
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    )}
                    <span className="text-sm font-medium text-gray-900">{statusMessage}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">姿勢検出モデル:</span>
                  <div className="flex items-center space-x-1">
                    {isModelLoaded ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-700">準備完了</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-yellow-700">読み込み中</span>
                      </>
                    )}
                  </div>
                </div>
                
                {showComparison && userUploadedVideo && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">デモ動画:</span>
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1">
                        {isDemoVideoLoaded ? (
                          <>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-xs text-green-700">ロード完了</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-orange-700">ロード中</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        {isDemoReady ? (
                          <>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-xs text-green-700">解析準備完了</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-yellow-700">解析準備中</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">ポーズ検出:</span>
                  <div className="flex items-center space-x-1">
                    {landmarks && landmarks.length > 0 ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-green-700">検出中 ({landmarks.length}人)</span>
                      </>
                    ) : (
                      <>
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <span className="text-sm font-medium text-gray-600">未検出</span>
                      </>
                    )}
                  </div>
                </div>
                
                {isRecording && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">録画状態:</span>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-red-700">解析動画録画中</span>
                    </div>
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
