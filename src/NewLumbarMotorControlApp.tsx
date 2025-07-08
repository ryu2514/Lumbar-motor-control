import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause, BarChart3 } from 'lucide-react';

// MediaPipe の型定義（型の互換性の問題により直接使用せず）

// カスタムフックのインポート
import { usePoseLandmarker } from './hooks/usePoseLandmarker';
import { useMetrics } from './hooks/useMetrics';
import { useTimeSeriesData } from './hooks/useTimeSeriesData';

// データ保護関連のインポート（エラーハンドリング付き）
let memoryProtection: any = { destroyAll: () => {}, shutdown: () => {} };
let dataProtection: any = { cleanup: () => {} };

// 動的インポートでモジュールを読み込み
if (typeof window !== 'undefined') {
  Promise.all([
    import('./utils/memoryProtection').catch(() => null),
    import('./utils/dataProtection').catch(() => null)
  ]).then(([memoryModule, protectionModule]) => {
    if (memoryModule) memoryProtection = memoryModule.memoryProtection;
    if (protectionModule) dataProtection = protectionModule.dataProtection;
  }).catch(error => {
    console.warn('Data protection modules not available:', error);
  });
}

// 型定義のインポート
import { LANDMARKS } from './types';

// ユーティリティのインポート
import { resetAngleFilter, calculateFilteredLumbarAngle, calculateMidpoint } from './utils/geometryUtils';

// コンポーネントのインポート
import { LumbarExcessiveMovementChartWithStats } from './components/LumbarAngleChart';

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
const MetricsDisplay: React.FC<{ metrics: Metric[]; compact?: boolean }> = ({ metrics, compact = false }) => {
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
      
      <h3 className="text-lg font-medium mb-3">📊 評価結果</h3>
      <div className={compact ? "space-y-2" : "space-y-4"}>
        {metrics.map((metric, index) => (
          <div key={index} className={`bg-gray-50 rounded-md ${compact ? "p-2.5" : "p-3"}`}>
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
  // デバイス検出
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // テスト種類の状態管理
  const [testType, setTestType] = useState<TestType>('standingHipFlex');
  const [videoUrl, setVideoUrl] = useState<string>(DEMO_VIDEOS[testType]);
  const [userUploadedVideo, setUserUploadedVideo] = useState<string | null>(null);
  const [useUploadedVideo, setUseUploadedVideo] = useState<boolean>(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  const [showComparison, setShowComparison] = useState<boolean>(false);
  const [showChart, setShowChart] = useState<boolean>(true);
  const [videoRetryCount, setVideoRetryCount] = useState<number>(0);
  const [loadingTimeout, setLoadingTimeout] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [preferredVideoFormat] = useState<'auto' | 'mp4' | 'webm'>('mp4');
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
      
      // 動画解析録画も自動開始
      if (!isRecording) {
        startVideoRecording();
      }
    } else if (!isPlaying && timeSeriesData.isRecording) {
      // 動画が停止されたら記録も停止
      console.log('Stopping auto recording...');
      stopRecording();
      
      // 動画解析録画も停止（但し録画データは保持）
      if (isRecording) {
        stopVideoRecording();
      }
    }
  }, [isPlaying, isVideoLoaded, isModelLoaded]);

  // 腰椎過剰運動量の取得と記録
  useEffect(() => {
    // 基本的な条件チェック
    console.log('🔍 グラフ記録条件チェック:', {
      記録中: timeSeriesData.isRecording,
      結果存在: !!result,
      worldLandmarks存在: !!(result?.worldLandmarks),
      worldLandmarks長さ: result?.worldLandmarks?.length || 0
    });
    
    if (timeSeriesData.isRecording && result && result.worldLandmarks && result.worldLandmarks.length > 0) {
      const landmarks = result.worldLandmarks[0];
      
      // ランドマーク検出状況をログ
      console.log('🎯 ランドマーク検出状況:', {
        左肩: !!landmarks[LANDMARKS.LEFT_SHOULDER],
        右肩: !!landmarks[LANDMARKS.RIGHT_SHOULDER],
        左腰: !!landmarks[LANDMARKS.LEFT_HIP],
        右腰: !!landmarks[LANDMARKS.RIGHT_HIP]
      });
      
      // 必要なランドマークが検出されている場合のみ計算（座位膝関節伸展では膝も必要）
      const hasBasicLandmarks = landmarks[LANDMARKS.LEFT_SHOULDER] && landmarks[LANDMARKS.RIGHT_SHOULDER] &&
          landmarks[LANDMARKS.LEFT_HIP] && landmarks[LANDMARKS.RIGHT_HIP];
      const hasKneeLandmarks = landmarks[LANDMARKS.LEFT_KNEE] && landmarks[LANDMARKS.RIGHT_KNEE] && landmarks[LANDMARKS.LEFT_ANKLE];
      
      if (hasBasicLandmarks && (testType !== 'seatedKneeExt' || hasKneeLandmarks)) {
        
        const shoulderMid = calculateMidpoint(
          landmarks[LANDMARKS.LEFT_SHOULDER],
          landmarks[LANDMARKS.RIGHT_SHOULDER]
        );
        
        const hipMid = calculateMidpoint(
          landmarks[LANDMARKS.LEFT_HIP],
          landmarks[LANDMARKS.RIGHT_HIP]
        );
        
        const lumbarAngle = calculateFilteredLumbarAngle(shoulderMid, hipMid);
        
        // テスト別の腰椎過剰運動量を計算（メトリクス表示と一致させる）
        let excessiveMovement = 0;
        
        if (testType === 'rockBack') {
          // ロックバック: useMetrics.tsと同じ計算式を使用（オフセット12°）
          excessiveMovement = Math.max(0, Math.abs(lumbarAngle) - 12);
        } else if (testType === 'seatedKneeExt') {
          // 座位膝関節伸展: 膝伸展動作検出時のみ腰椎過剰運動量を計算
          const kneeAngle = calculateKneeAngleForGraph(landmarks);
          const isKneeExtending = detectKneeExtensionForGraph(kneeAngle);
          
          if (isKneeExtending) {
            // 膝伸展中のみ腰椎過剰運動量を計算
            const baselineAngle = 20; // 安静時の基準角度
            if (lumbarAngle > 0) {
              // 前屈方向: より穏やかな反転効果で安静時数値を下げる
              excessiveMovement = Math.max(0, (baselineAngle - lumbarAngle) * 1.0);
            } else {
              // 後屈方向: より穏やかな反転効果
              excessiveMovement = Math.max(0, (baselineAngle - Math.abs(lumbarAngle)) * 0.5);
            }
            
            // 膝伸展中で計算結果が0の場合は最低限の値を設定（動きが止まっても評価継続）
            if (excessiveMovement === 0) {
              excessiveMovement = 1.0; // 膝伸展維持中は最低1°の過剰運動量を表示
            }
          } else {
            // 膝伸展していない時は過剰運動量を0に設定
            excessiveMovement = 0;
          }
        } else {
          // 立位股関節屈曲: useMetrics.tsと同じ計算式（オフセット8°）
          excessiveMovement = Math.max(0, Math.abs(lumbarAngle) - 8);
        }
        
        addDataPoint(excessiveMovement);
        
      }
    }
  }, [result, timeSeriesData.isRecording, addDataPoint, testType]);

  const handleVideoUpload = useCallback((file: File) => {
    console.log('📤 アップロード開始:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });
    
    // 動画ファイルの検証
    if (!file.type.startsWith('video/')) {
      alert('動画ファイルを選択してください。');
      return;
    }
    
    // ファイルサイズチェック（100MB制限）
    if (file.size > 100 * 1024 * 1024) {
      alert('ファイルサイズが大きすぎます。100MB以下のファイルを選択してください。');
      return;
    }
    
    const url = URL.createObjectURL(file);
    setUserUploadedVideo(url);
    setUseUploadedVideo(true);
    setVideoUrl(url);
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setIsDemoVideoLoaded(false);
    setVideoRetryCount(0);
    setShowComparison(false); // デフォルトでは比較表示をオフに
    
    // アップロード後デモ動画を初期化
    setTimeout(() => {
      console.log('📤 Video uploaded, initializing demo video...');
      initializeDemoVideo();
    }, 1500);
    
    // 動画要素をリセット
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      
      // アップロード動画の読み込みを開始
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          console.log('🔄 アップロード動画の読み込み開始');
        }
      }, 200);
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
    
    // テスト種類が変更されたときは常にデモ動画に切り替え
    setUseUploadedVideo(false);
    setShowComparison(false);
    setVideoUrl(DEMO_VIDEOS[testType]);
    
    // 動画切り替え時の状態リセット
    setIsVideoLoaded(false);
    setIsPlaying(false);
    setIsDemoVideoLoaded(false);
    setVideoRetryCount(0);
    
    // タイムアウトをクリア
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      setLoadingTimeout(null);
    }
    
    // 角度フィルターをリセット
    resetAngleFilter();
    
    // ログ出力
    console.log('テスト種類変更:', testType, 'デモ動画に切り替え');
    
    // 動画を停止
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // 動画を最初に戻す
      
      // デモ動画の読み込みを強制的に再開始（より積極的な初期化）
      setTimeout(() => {
        if (videoRef.current && !useUploadedVideo) {
          console.log('🔄 デモ動画の強制リロード');
          // preload を auto に設定してから load
          videoRef.current.preload = 'auto';
          videoRef.current.load();
        }
      }, 100);
    }
    
    if (demoVideoRef.current) {
      demoVideoRef.current.pause();
      demoVideoRef.current.currentTime = 0;
    }
  }, [testType]);

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
      } else {
        console.log('Play command sending...');
        await video.play();
        console.log('Play command completed');
      }
    } catch (error) {
      console.error('動画再生エラー:', error);
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
        currentSrc: video.currentSrc,
        isUploadedVideo: useUploadedVideo
      });
      
      // シンプルな条件: readyState が 1 以上なら OK
      if (video.readyState >= 1) {
        setIsVideoLoaded(true);
        
        // タイムアウトをクリア
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
        
        console.log('✅ 動画読み込み完了', useUploadedVideo ? '(アップロード動画)' : '(デモ動画)');
      } else {
        console.warn('動画のメタデータが不完全:', {
          readyState: video.readyState,
          isUploadedVideo: useUploadedVideo
        });
        
        // 1秒後に再チェック
        setTimeout(() => {
          if (videoRef.current && !isVideoLoaded) {
            const video = videoRef.current;
            if (video.readyState >= 1) {
              setIsVideoLoaded(true);
              console.log('✅ 動画読み込み完了（再チェック）', useUploadedVideo ? '(アップロード動画)' : '(デモ動画)');
            }
          }
        }, 1000);
      }
    }
  }, [loadingTimeout, useUploadedVideo, isVideoLoaded]);

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
  

  // ファイルアップロード用の隠しInput参照
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 動画の手動再読み込み
  const reloadVideo = useCallback(() => {
    if (videoRef.current) {
      console.log('Manual video reload triggered');
      setIsVideoLoaded(false);
      setVideoRetryCount(0);
      
      // 既存のタイムアウトをクリア
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setLoadingTimeout(null);
      }
      
      videoRef.current.load();
    }
  }, [loadingTimeout]);
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
        // モバイルの場合：直接ダウンロードを試行
        console.log('📱 モバイルデバイス検出: 直接ダウンロードを実行');
        
        const adjustedBlob = extension === 'mp4' 
          ? new Blob([recordedVideoBlob], { type: 'video/mp4' })
          : recordedVideoBlob;
        
        const url = URL.createObjectURL(adjustedBlob);
        
        // まず標準的なダウンロードを試行
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        
        try {
          a.click();
          document.body.removeChild(a);
          alert('動画のダウンロードを開始しました。ダウンロードフォルダをご確認ください。');
          
          // モバイルでは少し長めにURL保持
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 5000);
          
        } catch (error) {
          // 直接ダウンロードが失敗した場合は軽量なビューアーを開く
          console.log('直接ダウンロード失敗、軽量ビューアーを開きます');
          document.body.removeChild(a);
          
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(`<!DOCTYPE html>
<html><head>
<title>動画ダウンロード (${extension.toUpperCase()})</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;text-align:center;font-family:system-ui}video{max-width:100%;height:auto}a{display:inline-block;background:#007AFF;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;margin:10px}</style>
</head><body>
<h2>解析動画 (${extension.toUpperCase()})</h2>
<video controls><source src="${url}" type="video/${extension}"></video>
<p>ファイル名: ${filename}<br>サイズ: ${(adjustedBlob.size / 1024 / 1024).toFixed(2)}MB</p>
<a href="${url}" download="${filename}">動画をダウンロード</a>
<p>※ ダウンロードがうまくいかない場合は、動画を長押しして「動画を保存」を選択してください。</p>
</body></html>`);
            newWindow.document.close();
          } else {
            alert('新しいタブを開けませんでした。ダウンロードリンクを表示します。');
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.textContent = `${filename} をダウンロード`;
            link.style.display = 'block';
            link.style.margin = '10px';
            document.body.appendChild(link);
            setTimeout(() => document.body.removeChild(link), 10000);
          }
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
      
      
    } catch (error) {
      console.error('❌ ダウンロードエラー:', error);
      alert(`ダウンロードに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [recordedVideoBlob, preferredVideoFormat, isMobile]);

  // ポーズデータを取得するためのRef（リアルタイム更新用）
  const currentPoseDataRef = useRef<any[][] | null>(null);

  // ポーズデータをRefに更新（リアルタイム同期）
  useEffect(() => {
    if (result && result.landmarks && result.landmarks.length > 0) {
      currentPoseDataRef.current = result.landmarks;
    }
  }, [result]);

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
        setIsRecording(false);
        recordingChunksRef.current = []; // チャンクをクリア
      };

      mediaRecorder.onerror = (event) => {
        console.error('📹 Recording error:', event);
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

      // 改善された描画ループ - Refを使用してリアルタイムポーズデータを取得
      let frameCount = 0;
      
      const drawFrame = () => {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        
        try {
          frameCount++;
          
          // キャンバスをクリア
          ctx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
          
          // 動画フレームを描画
          ctx.drawImage(video, 0, 0, compositeCanvas.width, compositeCanvas.height);
          
          // Refから最新のポーズデータを取得（リアルタイム）
          const currentLandmarks = currentPoseDataRef.current;
          
          // ポーズ描画
          if (currentLandmarks && currentLandmarks.length > 0) {
            if (frameCount % 30 === 0) { // 1秒に1回ログ出力
              console.log('🎨 録画中ポーズ描画:', {
                人数: currentLandmarks.length,
                フレーム: frameCount,
                ランドマーク数: currentLandmarks[0]?.length || 0
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
              console.log('⚠️ 録画中ポーズなし:', { フレーム: frameCount });
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
      
    } catch (error) {
      console.error('Recording error:', error);
      alert('録画の開始に失敗しました');
      setIsRecording(false);
    }
  }, [landmarks, result, isVideoLoaded]);

  // 解析動画の録画停止
  const stopVideoRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 Stopping video recording...');
      mediaRecorderRef.current.stop();
    }
  }, [isRecording]);

  // 解析データをダウンロード

  // JSXレンダリング部分
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">腰椎運動制御の評価</h1>
        <p className="text-lg text-gray-600 font-medium">Lumbar Motor Control</p>
      </div>
      
      {/* テストセレクター */}
      <TestSelector currentTest={testType} onChange={setTestType} />
      
      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左側: 動画と操作UIエリア */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold mb-4">{TEST_LABELS[testType]}</h2>
            
            {/* 動画表示エリア */}
            <div className={`grid gap-4 mb-4 ${showComparison && userUploadedVideo ? 'grid-cols-1' : 'grid-cols-1'}`}>
              {/* メイン動画（アップロード動画または選択された動画） */}
              <div className="relative aspect-video lg:aspect-video bg-black rounded overflow-hidden">
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
                  preload={useUploadedVideo ? "metadata" : "auto"}
                  style={{ pointerEvents: 'none' }}
                  onLoadStart={() => {
                    console.log('Video load start event');
                    setIsVideoLoaded(false);
                    
                    // 既存のタイムアウトをクリア
                    if (loadingTimeout) {
                      clearTimeout(loadingTimeout);
                    }
                    
                    // 30秒後にタイムアウト
                    const timeoutId = window.setTimeout(() => {
                      if (!isVideoLoaded) {
                        console.warn('⏰ Video loading timeout');
                      }
                    }, 30000);
                    
                    setLoadingTimeout(timeoutId);
                  }}
                  onLoadedMetadata={() => {
                    console.log('Video metadata loaded');
                    // メタデータ読み込み時点で利用可能とみなす
                    if (videoRef.current) {
                      setIsVideoLoaded(true);
                      if (loadingTimeout) {
                        clearTimeout(loadingTimeout);
                        setLoadingTimeout(null);
                      }
                      console.log('✅ 動画メタデータ読み込み完了', useUploadedVideo ? '(アップロード動画)' : '(デモ動画)');
                    }
                  }}
                  onLoadedData={handleVideoLoaded}
                  onCanPlay={() => {
                    console.log('Video can play event');
                    if (videoRef.current) {
                      // シンプルな条件: canPlay が発火すれば基本的に OK
                      setIsVideoLoaded(true);
                      
                      // タイムアウトをクリア
                      if (loadingTimeout) {
                        clearTimeout(loadingTimeout);
                        setLoadingTimeout(null);
                      }
                      
                      console.log('✅ Video can play - 読み込み完了', useUploadedVideo ? '(アップロード動画)' : '(デモ動画)');
                    }
                  }}
                  onCanPlayThrough={() => {
                    console.log('Video can play through event');
                    if (videoRef.current) {
                      // canPlayThrough が発火すれば確実に OK
                      setIsVideoLoaded(true);
                      
                      // タイムアウトをクリア
                      if (loadingTimeout) {
                        clearTimeout(loadingTimeout);
                        setLoadingTimeout(null);
                      }
                      
                      console.log('✅ Video can play through - 完全読み込み完了', useUploadedVideo ? '(アップロード動画)' : '(デモ動画)');
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
                      const errorDetails = {
                        error: video.error,
                        errorCode: video.error?.code,
                        errorMessage: video.error?.message,
                        networkState: video.networkState,
                        readyState: video.readyState,
                        currentSrc: video.currentSrc,
                        isUploadedVideo: useUploadedVideo
                      };
                      console.error('Video error details:', errorDetails);
                      
                      // アップロード動画の場合、より詳細なエラー情報
                      if (useUploadedVideo) {
                        console.error('アップロード動画エラー:', {
                          videoType: video.currentSrc?.includes('blob:') ? 'Blob URL' : 'File URL',
                          errorType: video.error?.code === 4 ? 'MEDIA_ERR_SRC_NOT_SUPPORTED' :
                                    video.error?.code === 3 ? 'MEDIA_ERR_DECODE' :
                                    video.error?.code === 2 ? 'MEDIA_ERR_NETWORK' :
                                    video.error?.code === 1 ? 'MEDIA_ERR_ABORTED' : 'Unknown'
                        });
                      }
                      
                      // 3回まで再試行
                      if (videoRetryCount < 3) {
                        console.log(`動画読み込み再試行中... (${videoRetryCount + 1}/3)`);
                        setVideoRetryCount(prev => prev + 1);
                        
                        // デモ動画の場合は少し長めの間隔で再試行
                        const retryDelay = useUploadedVideo ? 1000 : 2000;
                        setTimeout(() => {
                          video.load();
                        }, retryDelay);
                      } else {
                        setIsVideoLoaded(false);
                        console.error('❌ 動画読み込み失敗: 最大再試行回数に達しました');
                        
                        // デモ動画の場合、最終的に preload="auto" で再試行
                        if (!useUploadedVideo) {
                          console.log('🔄 デモ動画最終再試行（preload強制）');
                          video.preload = 'auto';
                          setTimeout(() => {
                            video.load();
                          }, 3000);
                        }
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 text-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-3"></div>
                    <div className="text-center">
                      <p className="font-medium">
                        {useUploadedVideo ? 'アップロード動画読み込み中...' : '動画読み込み中...'}
                      </p>
                      {videoRetryCount > 0 && (
                        <p className="text-sm text-yellow-300 mt-1">
                          再試行中... ({videoRetryCount}/3)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {/* デモ動画（比較表示時） */}
              {showComparison && userUploadedVideo && (
                <div className="relative aspect-video lg:aspect-video bg-black rounded overflow-hidden">
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
            
            {/* スマホ表示: 動画の直後に評価結果を配置 */}
            <div className="lg:hidden mt-3 mb-6 border-t border-gray-200 pt-4">
              {/* 評価指標の表示 */}
              {isVideoLoaded ? (
                <MetricsDisplay metrics={metrics} compact={true} />
              ) : (
                <div className="text-center text-gray-500 py-4">
                  <p className="mb-2">動画を再生すると評価結果が表示されます</p>
                  {!isModelLoaded && (
                    <p className="text-sm">姿勢検出モデル読み込み中...</p>
                  )}
                </div>
              )}
            </div>
            
            {/* 動画コントロールエリア */}
            <div className="space-y-3 mb-4">
              {/* 1行目: 再生ボタンとアップロードボタン */}
              <div className="grid grid-cols-2 gap-3">
                {/* 再生/一時停止ボタン */}
                <button 
                  className="flex items-center justify-center space-x-2 bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-sm font-medium min-h-[44px] shadow-sm"
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
                
                {/* 動画アップロードボタン */}
                <button 
                  className="flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium min-h-[44px] shadow-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>アップロード</span>
                </button>
              </div>
              
              {/* 2行目: 再読み込みとダウンロードボタン */}
              <div className="grid grid-cols-2 gap-3">
                {/* 再読み込みボタン */}
                <button 
                  className="flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-sm font-medium min-h-[44px] shadow-sm text-orange-700"
                  onClick={reloadVideo}
                  disabled={!isVideoLoaded}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                  </svg>
                  <span>再読み込み</span>
                </button>
                
                {/* 動画ダウンロードボタン */}
                <button 
                  className="flex items-center justify-center space-x-2 px-4 py-3 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 text-sm font-medium min-h-[44px] shadow-sm text-green-700"
                  onClick={downloadRecordedVideo}
                  disabled={!recordedVideoBlob}
                  title={recordedVideoBlob ? `動画ダウンロード (${(recordedVideoBlob.size / 1024 / 1024).toFixed(1)}MB)` : '録画後にダウンロード可能'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7,10 12,15 17,10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  <span>ダウンロード</span>
                </button>
              </div>

              {/* 表示オプション */}
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
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
                      {showComparison ? 'デモ動画非表示' : 'デモ動画も表示'}
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
        </div>
        
        {/* 右側: 評価結果とグラフ表示エリア（デスクトップ・タブレット用） */}
        <div className="space-y-6">
          {/* デスクトップ表示: 評価結果 */}
          <div className="hidden lg:block bg-white rounded-lg shadow-md p-4">
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
            <div className="space-y-4">
              {/* 手動記録制御ボタン */}
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">データ記録制御</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={timeSeriesData.isRecording ? stopRecording : startRecording}
                      className={`px-4 py-2 rounded-md text-white font-medium ${
                        timeSeriesData.isRecording 
                          ? 'bg-red-500 hover:bg-red-600' 
                          : 'bg-green-500 hover:bg-green-600'
                      }`}
                    >
                      {timeSeriesData.isRecording ? '記録停止' : '記録開始'}
                    </button>
                    <button
                      onClick={clearData}
                      className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                    >
                      データクリア
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  記録状態: {timeSeriesData.isRecording ? '記録中' : '停止中'} | 
                  データ数: {timeSeriesData.data.length}ポイント | 
                  経過時間: {timeSeriesData.duration.toFixed(1)}秒
                </div>
              </div>
              
              <LumbarExcessiveMovementChartWithStats
                data={timeSeriesData.data}
                isRecording={timeSeriesData.isRecording}
                duration={timeSeriesData.duration}
                statistics={getStatistics()}
                onExport={exportData}
                onClear={clearData}
              />
            </div>
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

// コンポーネントアンマウント時のデータ保護クリーンアップ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      if (memoryProtection && memoryProtection.destroyAll) {
        memoryProtection.destroyAll();
      }
      if (dataProtection && dataProtection.cleanup) {
        dataProtection.cleanup();
      }
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });
}

// =================================================================
// 6. 膝角度計算関数（座位膝関節伸展テスト用）
// =================================================================

/**
 * グラフ記録用の膝角度計算関数
 */
const calculateKneeAngleForGraph = (landmarks: any): number => {
  try {
    // 左膝の角度を計算（左股関節-左膝-左足首の角度）
    const leftHip = landmarks[LANDMARKS.LEFT_HIP];
    const leftKnee = landmarks[LANDMARKS.LEFT_KNEE];
    const leftAnkle = landmarks[LANDMARKS.LEFT_ANKLE];
    
    if (!leftHip || !leftKnee || !leftAnkle) {
      return 180; // ランドマークが取得できない場合はまっすぐとみなす
    }
    
    // ベクトル計算
    const thighVector = {
      x: leftHip.x - leftKnee.x,
      y: leftHip.y - leftKnee.y,
      z: leftHip.z - leftKnee.z
    };
    
    const shinVector = {
      x: leftAnkle.x - leftKnee.x,
      y: leftAnkle.y - leftKnee.y,
      z: leftAnkle.z - leftKnee.z
    };
    
    // 内積と大きさの計算
    const dotProduct = thighVector.x * shinVector.x + thighVector.y * shinVector.y + thighVector.z * shinVector.z;
    const thighMagnitude = Math.sqrt(thighVector.x ** 2 + thighVector.y ** 2 + thighVector.z ** 2);
    const shinMagnitude = Math.sqrt(shinVector.x ** 2 + shinVector.y ** 2 + shinVector.z ** 2);
    
    // 角度の計算（ラジアンから度に変換）
    const cosAngle = dotProduct / (thighMagnitude * shinMagnitude);
    const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
    
    return angle;
  } catch (error) {
    console.warn('膝角度計算エラー (グラフ用):', error);
    return 180; // エラー時はまっすぐとみなす
  }
};

// 膝角度履歴を保存する変数（グラフ用）
let kneeAngleHistory: number[] = [];
// グラフ用の膝伸展状態バッファ
let kneeExtensionStateBufferGraph: boolean[] = [];
let lastKneeExtensionStateGraph = false;

/**
 * グラフ記録用の膝伸展検出関数（安定性向上）
 */
const detectKneeExtensionForGraph = (currentKneeAngle: number): boolean => {
  try {
    // 膝角度履歴に追加
    kneeAngleHistory.push(currentKneeAngle);
    
    // 履歴サイズを制限（最大10フレーム）
    if (kneeAngleHistory.length > 10) {
      kneeAngleHistory.shift();
    }
    
    // 履歴が少ない場合は膝伸展なしとみなす
    if (kneeAngleHistory.length < 3) {
      return false;
    }
    
    // 膝伸展の検出条件（反応を向上）
    // 1. 現在の膝角度が150°以上（以前より低い閾値）
    // 2. 直近3フレームで角度が増加傾向（伸展方向）
    // 3. 角度が一定以上の動作をしている
    const recentAngles = kneeAngleHistory.slice(-3);
    const isExtended = currentKneeAngle >= 150; // 150°に下げて反応向上
    const isExtending = recentAngles[2] > recentAngles[1] && recentAngles[1] > recentAngles[0];
    const hasSignificantMovement = Math.abs(recentAngles[2] - recentAngles[0]) > 3; // 3°以上の変化で反応向上
    const isPartiallyExtended = currentKneeAngle >= 140; // 部分的伸展も許可
    
    // 現在の判定結果
    const currentDetection = isExtended || (isPartiallyExtended && isExtending) || (isExtending && hasSignificantMovement);
    
    // 状態バッファに追加
    kneeExtensionStateBufferGraph.push(currentDetection);
    
    // バッファサイズを制限（最大15フレーム）
    if (kneeExtensionStateBufferGraph.length > 15) {
      kneeExtensionStateBufferGraph.shift();
    }
    
    // 安定性を高めるためのフィルタリング
    if (kneeExtensionStateBufferGraph.length >= 5) {
      const recentStates = kneeExtensionStateBufferGraph.slice(-5);
      const trueCount = recentStates.filter(state => state).length;
      
      // 直近5フレーム中3回以上検出されたら膝伸展中と判定
      const shouldBeExtending = trueCount >= 3;
      
      // 一度膝伸展が始まったら、明確に停止するまで継続
      if (shouldBeExtending) {
        lastKneeExtensionStateGraph = true;
      } else if (lastKneeExtensionStateGraph) {
        // 現在伸展中の場合、角度が大幅に下がったら停止
        const averageRecentAngle = recentAngles.reduce((a, b) => a + b, 0) / recentAngles.length;
        if (averageRecentAngle < 130) { // 130°以下になったら停止
          lastKneeExtensionStateGraph = false;
        }
      }
      
      return lastKneeExtensionStateGraph;
    }
    
    return currentDetection;
  } catch (error) {
    console.warn('膝伸展検出エラー (グラフ用):', error);
    return false;
  }
};

export default NewLumbarMotorControlApp;
