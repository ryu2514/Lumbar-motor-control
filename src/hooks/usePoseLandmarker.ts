import { useEffect, useState, useRef } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerResult } from '../types';

/**
 * MediaPipe Pose Landmarker (runtime = mediapipe) を使用するカスタムフック
 * @param videoRef - 解析対象の video 要素への ref
 */
export const usePoseLandmarker = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const [result, setResult] = useState<PoseLandmarkerResult | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const [isLandmarkerReady, setIsLandmarkerReady] = useState(false);
  const requestRef = useRef<number>();
  const lastVideoTimeRef = useRef<number>(-1);

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

        // PoseLandmarker の初期化（runtime = mediapipe を指定）
        // 型定義にruntimesプロパティが含まれていないため、型アサーションを使用
        const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            // モデルは直接 CDN から読み込む
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU'  // WebGL を使用（高速化）
          },
          runningMode: 'VIDEO',
          numPoses: 1,        // 同時検出する人数
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
          // mediapipe runtimeを指定
          // @ts-expect-error: 型定義にはnullだが実際にはmediapipe runtimeをサポート
          runtime: 'mediapipe' as any
        });

        landmarkerRef.current = poseLandmarker;
        setIsLandmarkerReady(true);
        console.log('✅ PoseLandmarker初期化成功 (runtime: mediapipe)');
      } catch (error) {
        console.error('❌ PoseLandmarkerの初期化に失敗しました:', error);
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
  useEffect(() => {
    if (!isLandmarkerReady) {
      console.log('ℹ️ Landmarker未初期化のため、フレーム処理をスキップ');
      return;
    }
    
    if (!videoRef.current) {
      console.log('ℹ️ ビデオ要素が存在しないため、フレーム処理をスキップ');
      return;
    }

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
  }, [isLandmarkerReady, videoRef]);

  return result;
};
