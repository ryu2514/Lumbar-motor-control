// src/NewLumbarMotorControlApp.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Play, Pause, RotateCcw, AlertCircle, Info } from 'lucide-react';

// =================================================================
// 1. 型定義と定数 (重複をなくし、一箇所にまとめました)
// =================================================================

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

export type TestType = "standingHipFlex" | "rockBack" | "seatedKneeExt";

interface Metric {
  label: string;
  value: number;
  unit: string;
  status: 'normal' | 'caution' | 'abnormal';
  description: string;
  normalRange: string;
}

const POSE_LANDMARKS = {
  NOSE: 0, LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8, MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16, LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20, LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28, LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// =================================================================
// 2. ヘルパー関数 (角度計算など)
// =================================================================

const radToDeg = (rad: number) => (rad * 180) / Math.PI;

const calculateVector = (pointA: NormalizedLandmark, pointB: NormalizedLandmark) => ({
  x: pointB.x - pointA.x, y: pointB.y - pointA.y, z: pointB.z - pointA.z
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

// =================================================================
// 3. カスタムフック (ロジック部分)
// =================================================================

// 姿勢検出フック (モック実装)
const usePoseLandmarker = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[][] | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    let isMounted = true;
    console.log("📱 Mock: Loading PoseLandmarker model...");
    const timer = setTimeout(() => {
      if (isMounted) {
        console.log("📱 Mock: PoseLandmarker model loaded.");
        setIsModelLoaded(true);
      }
    }, 1500);
    return () => { isMounted = false; clearTimeout(timer); };
  }, []);

  const processFrame = useCallback((time: number) => {
    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const mockLandmarks = [
      Array.from({ length: 33 }, (_, i) => ({
        x: 0.5 + Math.sin(time / 500 + i * 0.5) * 0.2,
        y: 0.5 + Math.cos(time / 500 + i * 0.5) * 0.2,
        z: 0.0,
        visibility: 0.95
      }))
    ];
    setLandmarks(mockLandmarks);
    requestRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  useEffect(() => {
    if (isModelLoaded) {
      console.log("📱 Starting video frame processing");
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isModelLoaded, processFrame]);

  return { landmarks, isModelLoaded, error };
};

// 指標計算フック
const useMetrics = (testType: TestType, landmarks: NormalizedLandmark[][] | null): Metric[] => {
  const calculateMetrics = (landmarks: NormalizedLandmark[]): Metric[] => {
    if (!landmarks || landmarks.length < 33) return [];
    
    // この中に各テストの計算ロジックが入ります。
    // 今回は表示を優先するため、ダミーデータを返します。
    switch (testType) {
      case 'standingHipFlex':
        return [{ label: '股関節屈曲角度', value: 92.1, unit: '°', status: 'normal', description: '立位での股関節屈曲。', normalRange: '85-95°' }];
      case 'rockBack':
        return [{ label: '腰椎角度変化', value: 15.5, unit: '°', status: 'caution', description: 'ロックバック時の腰椎の変化。', normalRange: '10°以下' }];
      case 'seatedKneeExt':
        return [{ label: '膝伸展角度', value: 165.0, unit: '°', status: 'abnormal', description: '座位での膝の伸展。', normalRange: '175-180°' }];
      default:
        return [];
    }
  };

  if (!landmarks || !landmarks[0]) return [];
  return calculateMetrics(landmarks[0]);
};


// =================================================================
// 4. UIコンポーネント (画面の各部品)
// =================================================================

// テスト選択
const TestSelector: React.FC<{
  testType: TestType;
  setTestType: (type: TestType) => void;
}> = ({ testType, setTestType }) => (
    <div className="mb-4">
      <h2 className="text-lg font-semibold mb-2">評価テストの選択</h2>
      <div className="flex flex-wrap gap-2">
        <button className={`px-3 py-2 rounded ${testType === 'standingHipFlex' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTestType('standingHipFlex')}>立位股関節屈曲テスト</button>
        <button className={`px-3 py-2 rounded ${testType === 'rockBack' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTestType('rockBack')}>ロックバックテスト</button>
        <button className={`px-3 py-2 rounded ${testType === 'seatedKneeExt' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTestType('seatedKneeExt')}>座位膝伸展テスト</button>
      </div>
    </div>
  );

// 動画アップローダー
const VideoUploader: React.FC<{ onVideoUpload: (file: File) => void }> = ({ onVideoUpload }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) onVideoUpload(e.target.files[0]);
    };
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
        <p className="text-lg font-medium">動画ファイルをアップロード</p>
        <button className="mt-2 px-4 py-2 bg-blue-500 text-white rounded" onClick={() => inputRef.current?.click()}>ファイルを選択</button>
        <input type="file" accept="video/mp4,video/webm,video/ogg" className="hidden" ref={inputRef} onChange={handleChange} />
      </div>
    );
};

// 姿勢ビジュアライザー
const PoseVisualizer: React.FC<{
  landmarks: NormalizedLandmark[][] | null;
  videoWidth: number;
  videoHeight: number;
}> = ({ landmarks, videoWidth, videoHeight }) => {
  if (!landmarks || !landmarks[0]) return null;
  return (
    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" viewBox={`0 0 ${videoWidth} ${videoHeight}`}>
      {landmarks[0].map((lm, i) => (
        <circle key={i} cx={lm.x * videoWidth} cy={lm.y * videoHeight} r="5" fill="#f56565" />
      ))}
    </svg>
  );
};

// 指標表示
const MetricsDisplay: React.FC<{ metrics: Metric[] }> = ({ metrics }) => {
    if (metrics.length === 0) return <div className="text-gray-500">動画を再生するとここに測定値が表示されます。</div>;
    return (
      <div className="bg-white rounded-lg shadow-md p-4 mb-4">
        <h2 className="text-lg font-semibold mb-3">測定結果</h2>
        <div className="space-y-4">
          {metrics.map((metric, index) => (
            <div key={index}>
              <div className="flex justify-between items-center mb-1">
                <div className="font-medium">{metric.label}</div>
                <div className={`font-semibold ${metric.status === 'normal' ? 'text-green-600' : metric.status === 'caution' ? 'text-yellow-600' : 'text-red-600'}`}>
                  {metric.value.toFixed(1)}{metric.unit}
                </div>
              </div>
              <p className="text-sm text-gray-600">{metric.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
};

// =================================================================
// 5. メインアプリケーションコンポーネント
// =================================================================
const NewLumbarMotorControlApp: React.FC = () => {
  const [testType, setTestType] = useState<TestType>('standingHipFlex');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { landmarks, isModelLoaded, error: poseError } = usePoseLandmarker(videoRef);
  const metrics = useMetrics(testType, landmarks);

  const handleVideoUpload = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  }, []);

  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, []);

  return (
    <div className="bg-gray-100 min-h-screen p-4">
      <h1 className="text-xl font-bold text-center mb-4">腰椎モーターコントロール評価アプリ</h1>
      
      <TestSelector testType={testType} setTestType={setTestType} />
      
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* 左側: 動画エリア */}
        <div className="bg-white rounded-lg shadow-md p-4">
          {!videoUrl ? (
            <VideoUploader onVideoUpload={handleVideoUpload} />
          ) : (
            <div>
              <div className="relative bg-black w-full aspect-video mb-4">
                <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" loop playsInline />
                {isModelLoaded && videoRef.current && (
                  <PoseVisualizer landmarks={landmarks} videoWidth={videoRef.current.videoWidth} videoHeight={videoRef.current.videoHeight} />
                )}
              </div>
              <div className="flex justify-center gap-4">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2" onClick={togglePlayback}>
                  {isPlaying ? <><Pause /> 一時停止</> : <><Play /> 再生</>}
                </button>
              </div>
            </div>
          )}
          {!isModelLoaded && <p className="text-center text-gray-500 mt-2">分析モデルを読み込んでいます...</p>}
          {poseError && <p className="text-red-500 text-center mt-2">{poseError}</p>}
        </div>

        {/* 右側: 分析結果エリア */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <MetricsDisplay metrics={metrics} />
        </div>
      </div>
    </div>
  );
};

export default NewLumbarMotorControlApp;