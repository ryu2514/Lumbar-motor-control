import React, { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Upload, AlertCircle, X } from 'lucide-react';
import type { TestType } from '../types';

interface VideoUploaderProps {
  onVideoLoad: (file: File) => void;
  testType: TestType;
}

/**
 * 動画ファイルのアップロードと選択を処理するコンポーネント
 */
const VideoUploader: React.FC<VideoUploaderProps> = ({ onVideoLoad, testType }) => {
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ドラッグイベントハンドラー
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  // ドロップイベントハンドラー
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  // ファイル選択イベントハンドラー
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  // 対応するコーデックを持つ動画ファイルかチェック
  const acceptedTypes = ['video/mp4', 'video/webm', 'video/ogg'];
  const maxSizeMB = 100; // MB単位の最大ファイルサイズ

  // ファイル処理
  const processFile = (file: File) => {
    // 前回のエラーをクリア
    setErrorMessage(null);

    const fileSizeMB = file.size / (1024 * 1024);
    console.log('ℹ️ 選択されたファイル:', {
      name: file.name,
      type: file.type,
      size: `${fileSizeMB.toFixed(2)} MB`
    });

    // ファイルタイプのチェック
    if (!file.type.startsWith('video/')) {
      const error = '動画ファイルのみアップロード可能です';
      console.error('❌ ' + error, file.type);
      setErrorMessage(error);
      return;
    }

    // ファイルサイズのチェック
    if (fileSizeMB > maxSizeMB) {
      const error = `ファイルサイズが大きすぎます。${maxSizeMB}MB以下のファイルを選択してください。`;
      console.error('❌ ' + error, fileSizeMB.toFixed(2) + 'MB');
      setErrorMessage(error);
      return;
    }

    // 対応フォーマットのチェック
    if (acceptedTypes.includes(file.type)) {
      console.log('✅ サポートされたビデオファイル:', file.type);
    } else {
      console.warn('⚠️ サポートされていない可能性のあるビデオフォーマット:', file.type);
      setErrorMessage(`注意: ${file.type} はサポートされていない可能性があります。読み込みに失敗した場合は別の形式をお試しください。`);
    }

    // すべてのチェックが通った場合、ファイルを処理
    setUploadedFile(file);
    onVideoLoad(file);
  };

  // ファイルの削除
  const clearFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // テスト種類に応じたプレースホルダーテキスト
  const getPlaceholderText = () => {
    switch (testType) {
      case 'standingHipFlex':
        return '立位股関節屈曲テストの動画をアップロード';
      case 'rockBack':
        return 'ロックバックテストの動画をアップロード';
      case 'seatedKneeExt':
        return '座位膝関節伸展テストの動画をアップロード';
      default:
        return '評価用の動画をアップロード';
    }
  };

  return (
    <div className="mb-6">
      <div
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploadedFile ? 'bg-green-50' : 'bg-gray-50'}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="video/*"
          className="hidden"
        />

        {!uploadedFile ? (
          <div className="text-center">
            <Upload className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-700">{getPlaceholderText()}</h3>
            <p className="mb-4 text-sm text-gray-500">
              ここにドラッグ＆ドロップ、または
            </p>
            <label htmlFor="video-upload" className="py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 font-medium flex items-center justify-center cursor-pointer transition-colors">
              <Upload size={20} className="mr-2" /> ビデオを選択
            </label>
            <p className="text-sm text-gray-500 mt-2">支援形式: MP4, WebM, Ogg (最大 {maxSizeMB}MB)</p>
            {errorMessage && (
              <div className="flex items-center text-red-600 bg-red-100 p-2 rounded mt-2">
                <AlertCircle size={16} className="mr-1" />
                <span className="text-sm">{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Upload className="h-6 w-6 text-green-600 mr-2" />
                <span className="font-medium text-green-700 truncate max-w-xs">
                  {uploadedFile.name}
                </span>
              </div>
              <button
                onClick={clearFile}
                className="text-red-500 hover:text-red-700 focus:outline-none"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              サイズ: {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <p className="text-xs text-gray-500">
              別の動画を使用するには、上のXボタンをクリックしてから新しい動画をアップロードしてください
            </p>
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        * サポートされる形式: MP4, MOV, WebM など
      </div>
    </div>
  );
};

export default VideoUploader;
