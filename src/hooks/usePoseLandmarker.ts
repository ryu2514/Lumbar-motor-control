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
      try {
        console.log('✅ MediaPipe初期化開始: WASMファイル読み込み中...');
        // WASM ファイルを含む依存ファイルを読み込む
        const vision = await FilesetResolver.forVisionTasks(
          // CDN パスを使用（安定性のため）
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        console.log('✅ WASMファイル読み込み完了');

        // PoseLandmarker の初期化（最新のAPIに対応）
        // 型アサーションを使用して型エラーを回避
        const options = {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU' as 'GPU' // 型を固定して型エラーを回避
          },
          runningMode: 'VIDEO' as const,  // constアサーションで文字列リテラル型に
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false
        };

        // MediaPipeランタイムを確実に使用するための拡張オプション
        // @ts-ignore - MediaPipe内部API
        if (typeof options.baseOptions.runtime === 'undefined') {
          // @ts-ignore - MediaPipe内部API
          options._loadMediapipeRuntimeWasm = true;
        }

        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
        landmarkerRef.current = poseLandmarker;
        setIsLandmarkerReady(true);
        console.log('✅ PoseLandmarker初期化成功');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ PoseLandmarkerの初期化に失敗しました:', errorMsg);
        setError(`初期化エラー: ${errorMsg}`);
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
  
  // ビデオisVideoLoaded状態が変わったときにデバッグログを出力
  useEffect(() => {
    console.log(`🎥 ビデオロード状態変更: ${isVideoLoaded ? 'ロード済み' : '未ロード'}`);
    // ログレベルを変更してフレーム処理の再開をトリガー
    if (isVideoLoaded) {
      setIsLogLevel(prev => prev + 1);
    }
  }, [isVideoLoaded]);
  
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
          videoRef.current.paused ||
          videoRef.current.ended ||
          videoRef.current.readyState < 2 // HAVE_CURRENT_DATA以上であることを確認
        ) {
          // 「適切な状態でない」場合の詳細情報を出力
          if (videoRef.current && performance.now() % 3000 < 50) { // 3秒に1回程度ログを出力
            console.log('ℹ️ ビデオ状態がポーズ検出に適切ではありません:', { 
              paused: videoRef.current.paused,
              ended: videoRef.current.ended,
              readyState: videoRef.current.readyState,
              currentTime: videoRef.current.currentTime.toFixed(2),
              duration: videoRef.current.duration.toFixed(2),
              videoWidth: videoRef.current.videoWidth,
              videoHeight: videoRef.current.videoHeight
            });
          }
          // このフレームでの処理をスキップするが、ループは継続
          requestRef.current = requestAnimationFrame(detectFrame);
          return;
        }
        
        // ビデオ状態をデバッグ出力 (正常終了時)
        if (performance.now() % 1000 < 50) { // 1秒に1回程度ログを出力
          console.log('✅ ビデオフレーム処理中:', { 
            currentTime: videoRef.current.currentTime.toFixed(2),
            duration: videoRef.current.duration.toFixed(2),
            readyState: videoRef.current.readyState
          });
        }
        // ビデオの現在時間が変わった場合のみ処理（パフォーマンス向上）
        if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
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
              if (performance.now() % 1000 < 50) { // 1秒に1回程度ログを出力
                console.log('✅ ポーズ検出成功: ランドマーク数', detections.landmarks[0].length);
              }
            } else {
              if (performance.now() % 1000 < 50) { // 1秒に1回程度ログを出力
                console.log('❌ ポーズ検出失敗またはランドマークなし');
              }
            }

            // 最後に処理したビデオ時間を更新
            lastVideoTimeRef.current = videoRef.current.currentTime;
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
  }, [isLandmarkerReady, videoRef, isVideoLoaded, isLogLevel]);

  return { result, error, isReady: isLandmarkerReady };
};
