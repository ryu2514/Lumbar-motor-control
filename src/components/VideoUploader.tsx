import React, { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Upload, AlertCircle, X, AlertTriangle } from 'lucide-react';
import type { TestType } from '../types';
import { validateVideoFile, sanitizeFileName } from '../utils/securityUtils';

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
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
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

  // ファイル処理
  const processFile = (file: File) => {
    // 前回のエラーと警告をクリア
    setErrorMessage(null);
    setWarningMessages([]);

    const fileSizeMB = file.size / (1024 * 1024);
    
    // ファイル名をサニタイズ
    const sanitizedName = sanitizeFileName(file.name);
    
    console.log('ℹ️ 選択されたファイル:', {
      name: sanitizedName,
      originalName: file.name,
      type: file.type,
      size: `${fileSizeMB.toFixed(2)} MB`
    });

    // セキュリティバリデーション
    const validation = validateVideoFile(file);
    
    if (!validation.isValid) {
      console.error('❌ ファイルバリデーション失敗:', validation.error);
      setErrorMessage(validation.error!);
      return;
    }

    // 警告がある場合は表示
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('⚠️ ファイル警告:', validation.warnings);
      setWarningMessages(validation.warnings);
    }

    console.log('✅ ファイルバリデーション成功');

    // すべてのチェックが通った場合、ファイルを処理
    setUploadedFile(file);
    onVideoLoad(file);
  };

  // ファイルの削除
  const clearFile = () => {
    setUploadedFile(null);
    setErrorMessage(null);
    setWarningMessages([]);
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
            <p className="text-sm text-gray-500 mt-2">対応形式: MP4, WebM, Ogg, MOV, AVI (最大 100MB)</p>
            {errorMessage && (
              <div className="flex items-center text-red-600 bg-red-100 p-2 rounded mt-2">
                <AlertCircle size={16} className="mr-1" />
                <span className="text-sm">{errorMessage}</span>
              </div>
            )}
            {warningMessages.length > 0 && (
              <div className="mt-2 space-y-1">
                {warningMessages.map((warning, index) => (
                  <div key={index} className="flex items-center text-yellow-600 bg-yellow-100 p-2 rounded">
                    <AlertTriangle size={16} className="mr-1" />
                    <span className="text-sm">{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Upload className="h-6 w-6 text-green-600 mr-2" />
                <span className="font-medium text-green-700 truncate max-w-xs">
                  {sanitizeFileName(uploadedFile.name)}
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
