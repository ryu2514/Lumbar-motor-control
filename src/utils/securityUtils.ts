/**
 * セキュリティ関連のユーティリティ関数
 */

import { securityLogger } from './securityLogger';

// 許可されたビデオMIMEタイプ
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
] as const;

// 許可されたファイル拡張子
const ALLOWED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.ogg',
  '.mov',
  '.avi',
] as const;

// 最大ファイルサイズ (バイト単位)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// 最小ファイルサイズ (バイト単位) - 空ファイルや異常に小さいファイルを除外
const MIN_FILE_SIZE = 1024; // 1KB

/**
 * ファイル名をサニタイズする
 */
export const sanitizeFileName = (fileName: string): string => {
  // 危険な文字を除去
  return fileName
    .replace(/[<>:"/\\|?*]/g, '') // Windows/Unix で問題となる文字
    .replace(/[\x00-\x1f\x80-\x9f]/g, '') // 制御文字
    .replace(/^\.+/, '') // 先頭のドット
    .replace(/\.+$/, '') // 末尾のドット
    .replace(/\s+/g, '_') // 空白をアンダースコアに
    .substring(0, 255); // 最大長制限
};

/**
 * ファイルの拡張子を取得
 */
const getFileExtension = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? '' : fileName.substring(lastDotIndex).toLowerCase();
};

/**
 * ビデオファイルのバリデーション
 */
export interface VideoValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export const validateVideoFile = (file: File): VideoValidationResult => {
  const warnings: string[] = [];
  
  // ファイルサイズチェック
  if (file.size > MAX_FILE_SIZE) {
    const error = `ファイルサイズが大きすぎます。${MAX_FILE_SIZE / (1024 * 1024)}MB以下のファイルを選択してください。`;
    securityLogger.logEvent(
      'file_upload_rejected',
      'medium',
      'File size exceeded limit',
      { fileSize: file.size, fileName: file.name, limit: MAX_FILE_SIZE }
    );
    return { isValid: false, error };
  }
  
  if (file.size < MIN_FILE_SIZE) {
    const error = 'ファイルサイズが小さすぎます。有効な動画ファイルを選択してください。';
    securityLogger.logEvent(
      'file_upload_rejected',
      'medium',
      'File size below minimum',
      { fileSize: file.size, fileName: file.name, minimum: MIN_FILE_SIZE }
    );
    return { isValid: false, error };
  }
  
  // ファイル名のサニタイズチェック
  const originalName = file.name;
  const sanitizedName = sanitizeFileName(originalName);
  if (originalName !== sanitizedName) {
    warnings.push('ファイル名に不正な文字が含まれています。');
  }
  
  // 拡張子チェック
  const extension = getFileExtension(file.name);
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension as any)) {
    const error = `サポートされていないファイル形式です。許可されている形式: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`;
    securityLogger.logEvent(
      'file_upload_rejected',
      'medium',
      'Unsupported file extension',
      { fileName: file.name, extension, allowedExtensions: ALLOWED_VIDEO_EXTENSIONS }
    );
    return { isValid: false, error };
  }
  
  // MIMEタイプチェック
  if (!file.type.startsWith('video/')) {
    const error = '動画ファイルのみアップロード可能です。';
    securityLogger.logEvent(
      'file_upload_rejected',
      'high',
      'Non-video file type detected',
      { fileName: file.name, mimeType: file.type }
    );
    return { isValid: false, error };
  }
  
  if (!ALLOWED_VIDEO_TYPES.includes(file.type as any)) {
    const warning = `${file.type} は完全にサポートされていない可能性があります。`;
    warnings.push(warning);
    securityLogger.logEvent(
      'file_upload_warning',
      'low',
      'Potentially unsupported video format',
      { fileName: file.name, mimeType: file.type }
    );
  }
  
  // MIMEタイプと拡張子の整合性チェック
  const mimeExtensionMap: Record<string, string[]> = {
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/ogg': ['.ogg'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi'],
  };
  
  const expectedExtensions = mimeExtensionMap[file.type] || [];
  if (expectedExtensions.length > 0 && !expectedExtensions.includes(extension)) {
    warnings.push('ファイルの拡張子とMIMEタイプが一致していません。');
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

/**
 * 数値データのバリデーション
 */
export const validateNumericData = (value: number, min: number, max: number): boolean => {
  return !isNaN(value) && isFinite(value) && value >= min && value <= max;
};

/**
 * 角度データのバリデーション (-180度から180度)
 */
export const validateAngle = (angle: number): boolean => {
  return validateNumericData(angle, -180, 180);
};

/**
 * 座標データのバリデーション (0-1の正規化済み座標)
 */
export const validateNormalizedCoordinate = (coordinate: number): boolean => {
  return validateNumericData(coordinate, 0, 1);
};

/**
 * 文字列のHTMLエスケープ (XSS対策)
 */
export const escapeHtml = (text: string): string => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * エラーメッセージのサニタイズ
 */
export const sanitizeErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return escapeHtml(error);
  }
  if (error instanceof Error) {
    return escapeHtml(error.message);
  }
  return 'エラーが発生しました';
};