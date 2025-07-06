/**
 * クライアントサイドデータ保護ユーティリティ
 * UXに影響せずにデータを暗号化・匿名化・保護
 */

import { securityLogger } from './securityLogger';

// 暗号化用の秘密鍵生成（セッションごとに一意）
class DataProtection {
  private encryptionKey: CryptoKey | null = null;
  private isInitialized = false;
  private sessionId: string = '';

  constructor() {
    try {
      this.sessionId = this.generateSessionId();
      this.initializeEncryption().catch(error => {
        console.warn('Data protection initialization failed, using fallback mode:', error);
        this.isInitialized = false;
      });
    } catch (error) {
      console.warn('Data protection constructor failed:', error);
      this.isInitialized = false;
    }
  }

  /**
   * セッションIDの生成
   */
  private generateSessionId(): string {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      }
    } catch (error) {
      console.warn('Crypto API not available, using fallback session ID:', error);
    }
    
    // フォールバック: Math.randomを使用
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * 暗号化機能の初期化
   */
  private async initializeEncryption(): Promise<void> {
    try {
      // Web Crypto API の可用性をチェック
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        console.warn('Web Crypto API not available, data protection disabled');
        this.isInitialized = false;
        return;
      }

      // AES-GCM用の鍵を生成
      this.encryptionKey = await crypto.subtle.generateKey(
        {
          name: 'AES-GCM',
          length: 256,
        },
        false, // 鍵の抽出を不可に
        ['encrypt', 'decrypt']
      );
      
      this.isInitialized = true;
      console.log('Data protection initialized successfully');
      
      // securityLoggerが利用可能な場合のみログ
      if (typeof securityLogger !== 'undefined') {
        securityLogger.logEvent(
          'file_upload_accepted' as any,
          'low',
          'Data protection initialized',
          { sessionId: this.sessionId }
        );
      }
    } catch (error) {
      console.warn('Failed to initialize data protection:', error);
      this.isInitialized = false;
      
      // securityLoggerが利用可能な場合のみログ
      if (typeof securityLogger !== 'undefined') {
        securityLogger.logEvent(
          'error_occurred',
          'high',
          'Failed to initialize data protection',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  }

  /**
   * データの暗号化
   */
  async encryptData(data: ArrayBuffer): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array } | null> {
    if (!this.isInitialized || !this.encryptionKey) {
      await this.initializeEncryption();
      if (!this.encryptionKey) return null;
    }

    try {
      // ランダムなIV（初期化ベクトル）を生成
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // データを暗号化
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        this.encryptionKey,
        data
      );

      return { encrypted, iv };
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Data encryption failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return null;
    }
  }

  /**
   * データの復号化
   */
  async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array): Promise<ArrayBuffer | null> {
    if (!this.isInitialized || !this.encryptionKey) {
      return null;
    }

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        this.encryptionKey,
        encryptedData
      );

      return decrypted;
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Data decryption failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return null;
    }
  }

  /**
   * 座標データの匿名化（相対座標への変換）
   */
  anonymizeCoordinates(landmarks: any[]): any[] {
    if (!landmarks || landmarks.length === 0) return landmarks;

    try {
      // 体の中心点（腰部）を基準とした相対座標に変換
      const hipCenter = {
        x: (landmarks[23]?.x + landmarks[24]?.x) / 2 || 0.5,
        y: (landmarks[23]?.y + landmarks[24]?.y) / 2 || 0.5,
        z: (landmarks[23]?.z + landmarks[24]?.z) / 2 || 0
      };

      const anonymized = landmarks.map(landmark => {
        if (!landmark) return landmark;
        
        return {
          ...landmark,
          x: landmark.x - hipCenter.x, // 相対座標に変換
          y: landmark.y - hipCenter.y,
          z: landmark.z - hipCenter.z,
        };
      });

      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Coordinate data anonymized',
        { landmarkCount: landmarks.length }
      );

      return anonymized;
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Coordinate anonymization failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return landmarks;
    }
  }

  /**
   * ファイル名の匿名化
   */
  anonymizeFileName(originalName: string): string {
    try {
      const extension = originalName.includes('.') ? originalName.substring(originalName.lastIndexOf('.')) : '';
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      
      return `video_${timestamp}_${random}${extension}`;
    } catch (error) {
      console.warn('File name anonymization failed, using original name:', error);
      return originalName;
    }
  }

  /**
   * メモリ内データの安全な消去
   */
  secureDelete(data: any): void {
    try {
      if (data instanceof ArrayBuffer) {
        // ArrayBufferの内容をゼロで上書き
        const view = new Uint8Array(data);
        view.fill(0);
      } else if (data instanceof Uint8Array) {
        data.fill(0);
      } else if (typeof data === 'object' && data !== null) {
        // オブジェクトのプロパティを削除
        Object.keys(data).forEach(key => {
          delete data[key];
        });
      }

      // ガベージコレクションを促進
      if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
      }
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'low',
        'Secure data deletion failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 機密データのハッシュ化（ログ用）
   */
  async hashSensitiveData(data: string): Promise<string> {
    try {
      // SHA-256でハッシュ化（非可逆）
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data + this.sessionId);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    } catch (error) {
      return 'hash_error';
    }
  }

  /**
   * ブラウザストレージの暗号化
   */
  async setSecureItem(key: string, value: any): Promise<void> {
    try {
      const jsonString = JSON.stringify(value);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonString);
      
      const encrypted = await this.encryptData(data);
      if (encrypted) {
        const storageData = {
          encrypted: Array.from(new Uint8Array(encrypted.encrypted)),
          iv: Array.from(encrypted.iv),
          timestamp: Date.now()
        };
        
        localStorage.setItem(`secure_${key}`, JSON.stringify(storageData));
      }
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Secure storage failed',
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 暗号化されたブラウザストレージからの取得
   */
  async getSecureItem(key: string): Promise<any | null> {
    try {
      const stored = localStorage.getItem(`secure_${key}`);
      if (!stored) return null;
      
      const storageData = JSON.parse(stored);
      const encrypted = new Uint8Array(storageData.encrypted).buffer;
      const iv = new Uint8Array(storageData.iv);
      
      const decrypted = await this.decryptData(encrypted, iv);
      if (decrypted) {
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decrypted);
        return JSON.parse(jsonString);
      }
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Secure storage retrieval failed',
        { key, error: error instanceof Error ? error.message : String(error) }
      );
    }
    return null;
  }

  /**
   * セッション終了時のクリーンアップ
   */
  cleanup(): void {
    try {
      // 暗号化キーの削除
      this.encryptionKey = null;
      this.isInitialized = false;
      
      // 一時的なストレージアイテムの削除
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('secure_temp_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Data protection cleanup completed',
        { sessionId: this.sessionId }
      );
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'low',
        'Cleanup failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * データ保護統計の取得
   */
  getProtectionStats(): Record<string, any> {
    return {
      sessionId: this.sessionId,
      isInitialized: this.isInitialized,
      hasEncryptionKey: !!this.encryptionKey,
      timestamp: new Date().toISOString()
    };
  }
}

// シングルトンインスタンス
export const dataProtection = new DataProtection();

// ページアンロード時のクリーンアップ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dataProtection.cleanup();
  });
  
  // 開発環境でのデバッグ用
  if (process.env.NODE_ENV === 'development') {
    (window as any).dataProtection = dataProtection;
  }
}