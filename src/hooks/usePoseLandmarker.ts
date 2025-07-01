import { useEffect, useState, useRef } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerResult } from '../types';

/**
 * MediaPipe Pose Landmarker (runtime = mediapipe) を使用するカスタムフック
 * @param videoRef - 解析対象の video 要素への ref
 * @param isVideoLoaded - ビデオがロードされたかどうかを示すフラグ
 */
export const usePoseLandmarker = (videoRef: React.RefObject<HTMLVideoElement>, isVideoLoaded?: boolean) => {
  const [result, setResult] = useState<PoseLandmarkerResult | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isLandmarkerReady, setIsLandmarkerReady] = useState(false);
  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef<number>(-1);
  const [error, setError] = useState<string | null>(null);

  // PoseLandmarker の初期化
  useEffect(() => {
    const initializePoseLandmarker = async () => {
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`✅ MediaPipe初期化開始 (試行 ${retryCount + 1}/${maxRetries}): WASMファイル読み込み中...`);
          
          // WASM ファイルを含む依存ファイルを読み込む
          const vision = await FilesetResolver.forVisionTasks(
            // CDN パスを使用（安定性のため）
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
          );
          console.log('✅ WASMファイル読み込み完了');

        // PoseLandmarker の初期化（複数のモデルURLを試行）
        const modelUrls = [
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/pose_landmarker_lite.task',
          // フォールバック用のローカルファイル（将来的に追加可能）
        ];
        
        let poseLandmarker = null;
        let lastError = null;
        
        for (const modelUrl of modelUrls) {
          try {
            console.log(`📦 モデル読み込み試行: ${modelUrl}`);
            
            const options = {
              baseOptions: {
                modelAssetPath: modelUrl,
                delegate: 'CPU' as 'CPU' // CPUに変更して安定性を向上
              },
              runningMode: 'VIDEO' as const,
              numPoses: 1,
              minPoseDetectionConfidence: 0.3, // 閾値を下げて検出率向上
              minPosePresenceConfidence: 0.3,
              minTrackingConfidence: 0.3,
              outputSegmentationMasks: false
            };

            poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
            console.log(`✅ モデル読み込み成功: ${modelUrl}`);
            break;
          } catch (modelError) {
            lastError = modelError;
            console.warn(`⚠️ モデル読み込み失敗: ${modelUrl}`, modelError);
            continue;
          }
        }
        
        if (!poseLandmarker) {
          throw new Error(`すべてのモデルURLで読み込みに失敗しました。最後のエラー: ${lastError}`);
        }

          landmarkerRef.current = poseLandmarker;
          setIsLandmarkerReady(true);
          console.log('✅ PoseLandmarker初期化成功');
          return; // 成功したら関数を終了
          
        } catch (error) {
          retryCount++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`❌ PoseLandmarkerの初期化に失敗しました (試行 ${retryCount}/${maxRetries}):`, errorMsg);
          
          if (retryCount >= maxRetries) {
            setError(`初期化エラー: ${errorMsg} (${maxRetries}回試行後に失敗)`);
            return;
          }
          
          // 再試行前に少し待機
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    };

    initializePoseLandmarker();

    // クリーンアップ
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
    };
  }, []);

  // ビデオフレーム処理のループ
  // 再レンダリングをトリガーするためにisloglevelフラグを追加
  const [isLogLevel, setIsLogLevel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // ビデオisVideoLoaded状態が変わったときにデバッグログを出力
  useEffect(() => {
    console.log(`🎥 ビデオロード状態変更: ${isVideoLoaded ? 'ロード済み' : '未ロード'}`);
    // ログレベルを変更してフレーム処理の再開をトリガー
    if (isVideoLoaded) {
      setIsLogLevel(prev => prev + 1);
    }
  }, [isVideoLoaded]);

  // ビデオの再生状態をトラッキング
  useEffect(() => {
    const videoElement = videoRef?.current;
    if (!videoElement) return;

    const handlePlay = () => {
      console.log('🎵 ビデオ再生開始 - ポーズ検出ループを再開');
      setIsPlaying(true);
      setIsLogLevel(prev => prev + 1); // フレーム処理を再トリガー
    };

    const handlePause = () => {
      console.log('⏸️ ビデオ一時停止 - ポーズ検出ループを停止');
      setIsPlaying(false);
    };

    const handleEnded = () => {
      console.log('🏁 ビデオ終了 - ポーズ検出ループを停止');
      setIsPlaying(false);
    };

    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handleEnded);

    return () => {
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('ended', handleEnded);
    };
  }, [videoRef, isVideoLoaded]);
  
  // 主要なフレーム処理ループ
  useEffect(() => {
    if (!isLandmarkerReady) {
      console.log('ℹ️ Landmarker未初期化のため、フレーム処理をスキップ');
      return;
    }
    
    // ビデオがロードされていない場合は処理をスキップ
    if (!isVideoLoaded) {
      console.log('ℹ️ ビデオがまだロードされていないため、フレーム処理をスキップ');
      return;
    }
    
    // VideoRefが存在するか確認
    const videoElement = videoRef?.current;
    if (!videoElement) {
      const allVideos = document.querySelectorAll('video');
      console.log(`ℹ️ ビデオ要素が参照できません。ページ内のビデオ要素数: ${allVideos.length}`);
      return;
    }
    
    // ビデオのロード状態を確認と詳細なデバッグ情報
    console.log('🎥 ビデオ状態:', { 
      readyState: videoElement.readyState,
      width: videoElement.videoWidth, 
      height: videoElement.videoHeight,
      duration: videoElement.duration,
      isVideoLoaded: isVideoLoaded
    });
    
    // DOM内のすべてのビデオタグの状態を詳細チェック
    document.querySelectorAll('video').forEach((v, i) => {
      console.log(`ビデオ要素[${i}]:`, {
        width: v.videoWidth,
        height: v.videoHeight,
        readyState: v.readyState,
        paused: v.paused,
        currentSrc: v.currentSrc ? '有り' : 'なし',
        isActive: v === videoElement
      });
    });

    const detectFrame = () => {
      try {
        // ビデオ要素の状態チェック
        if (
          !videoRef.current || 
          !landmarkerRef.current ||
          videoRef.current.readyState < 2 // HAVE_CURRENT_DATA以上であることを確認
        ) {
          // 次のフレームを継続リクエスト
          requestRef.current = requestAnimationFrame(detectFrame);
          return;
        }

        // ビデオが一時停止または終了している場合でも検出を継続（静止画でも姿勢を検出）
        if (videoRef.current.paused || videoRef.current.ended) {
          // 一時停止時でも現在のフレームでポーズ検出を実行
          if (performance.now() % 1000 < 50) { // 1秒に1回程度ログを出力
            console.log('⏸️ ビデオ一時停止中でもポーズ検出を継続');
          }
        }
        
        // ビデオ状態をデバッグ出力 (正常終了時)
        if (performance.now() % 1000 < 50) { // 1秒に1回程度ログを出力
          console.log('✅ ビデオフレーム処理中:', { 
            currentTime: videoRef.current.currentTime.toFixed(2),
            duration: videoRef.current.duration.toFixed(2),
            readyState: videoRef.current.readyState
          });
        }
        // ビデオの現在時間が変わった場合または一時停止中でもポーズ検出を実行
        const shouldDetect = videoRef.current.currentTime !== lastVideoTimeRef.current || 
                           videoRef.current.paused || 
                           videoRef.current.ended;
        
        if (shouldDetect) {
          try {
            // 現在のビデオフレームでポーズ検出を実行
            const detections = landmarkerRef.current.detectForVideo(
              videoRef.current,
              performance.now()
            );

            // 結果を状態にセット
            if (detections && detections.landmarks && detections.landmarks.length > 0) {
              setResult({
                landmarks: detections.landmarks,
                worldLandmarks: detections.worldLandmarks || []
              });
              if (performance.now() % 2000 < 50) { // 2秒に1回程度ログを出力
                console.log('✅ ポーズ検出成功: ランドマーク数', detections.landmarks[0].length);
              }
            } else {
              if (performance.now() % 2000 < 50) { // 2秒に1回程度ログを出力
                console.log('❌ ポーズ検出失敗またはランドマークなし');
              }
            }

            // 最後に処理したビデオ時間を更新（再生中のみ）
            if (!videoRef.current.paused && !videoRef.current.ended) {
              lastVideoTimeRef.current = videoRef.current.currentTime;
            }
          } catch (detectionError) {
            console.error('🔍 フレーム処理中に検出エラーが発生:', detectionError);
          }
        }
      } catch (error) {
        console.error('❌ フレーム処理中にエラーが発生しました:', error);
      }

      // 次のアニメーションフレームをリクエスト
      requestRef.current = requestAnimationFrame(detectFrame);
    };

    // 検出ループを開始
    detectFrame();

    // クリーンアップ
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [isLandmarkerReady, videoRef, isVideoLoaded, isLogLevel, isPlaying]);

  return { result, error, isReady: isLandmarkerReady };
};
