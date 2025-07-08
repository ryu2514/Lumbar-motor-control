/**
 * メモリ保護とデータライフサイクル管理
 * クライアントサイドでの機密データの安全な処理
 */

import { securityLogger } from './securityLogger';

interface ProtectedData {
  id: string;
  data: any;
  createdAt: number;
  accessCount: number;
  maxAccess?: number;
  ttl?: number; // Time to live in milliseconds
}

class MemoryProtection {
  private protectedStorage = new Map<string, ProtectedData>();
  private cleanupInterval: number | null = null;
  private readonly defaultTTL = 5 * 60 * 1000; // 5分
  private readonly cleanupIntervalMs = typeof window !== 'undefined' && window.innerWidth < 768 ? 120 * 1000 : 30 * 1000; // モバイルでは2分、デスクトップでは30秒

  constructor() {
    this.startCleanupScheduler();
  }

  /**
   * データを保護されたメモリ領域に保存
   */
  storeProtected(
    id: string,
    data: any,
    options: {
      ttl?: number;
      maxAccess?: number;
      autoDestroy?: boolean;
    } = {}
  ): void {
    try {
      const protectedData: ProtectedData = {
        id,
        data: this.deepClone(data),
        createdAt: Date.now(),
        accessCount: 0,
        ttl: options.ttl || this.defaultTTL,
        maxAccess: options.maxAccess
      };

      this.protectedStorage.set(id, protectedData);

      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Data stored in protected memory',
        { id, ttl: protectedData.ttl, maxAccess: protectedData.maxAccess }
      );

      // 自動破棄が有効な場合
      if (options.autoDestroy !== false && protectedData.ttl) {
        setTimeout(() => {
          this.secureDestroy(id);
        }, protectedData.ttl);
      }
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Failed to store protected data',
        { id, error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * 保護されたデータの取得
   */
  getProtected(id: string): any | null {
    try {
      const protectedData = this.protectedStorage.get(id);
      
      if (!protectedData) {
        return null;
      }

      // TTL チェック
      if (protectedData.ttl && Date.now() - protectedData.createdAt > protectedData.ttl) {
        this.secureDestroy(id);
        return null;
      }

      // アクセス回数チェック
      protectedData.accessCount++;
      
      if (protectedData.maxAccess && protectedData.accessCount > protectedData.maxAccess) {
        const data = this.deepClone(protectedData.data);
        this.secureDestroy(id);
        return data;
      }

      return this.deepClone(protectedData.data);
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Failed to retrieve protected data',
        { id, error: error instanceof Error ? error.message : String(error) }
      );
      return null;
    }
  }

  /**
   * データの安全な破棄
   */
  secureDestroy(id: string): boolean {
    try {
      const protectedData = this.protectedStorage.get(id);
      
      if (!protectedData) {
        return false;
      }

      // データの内容を安全に消去
      this.secureWipeData(protectedData.data);
      
      // マップから削除
      this.protectedStorage.delete(id);

      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Protected data securely destroyed',
        { id, accessCount: protectedData.accessCount }
      );

      return true;
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Failed to destroy protected data',
        { id, error: error instanceof Error ? error.message : String(error) }
      );
      return false;
    }
  }

  /**
   * データの安全な消去 - モバイル最適化
   */
  private secureWipeData(data: any): void {
    if (data === null || data === undefined) {
      return;
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    try {
      if (data instanceof ArrayBuffer) {
        const view = new Uint8Array(data);
        // モバイルでは1回のみ、デスクトップでは3回上書き
        const passes = isMobile ? 1 : 3;
        for (let pass = 0; pass < passes; pass++) {
          crypto.getRandomValues(view);
        }
        view.fill(0); // 最終的にゼロで埋める
      } else if (data instanceof Uint8Array || data instanceof Int8Array) {
        const passes = isMobile ? 1 : 3;
        for (let pass = 0; pass < passes; pass++) {
          crypto.getRandomValues(data as Uint8Array);
        }
        data.fill(0);
      } else if (Array.isArray(data)) {
        data.forEach((item, index) => {
          if (!isMobile) {
            this.secureWipeData(item); // モバイルでは簡略化
          }
          data[index] = null;
        });
        data.length = 0;
      } else if (typeof data === 'object') {
        Object.keys(data).forEach(key => {
          if (!isMobile) {
            this.secureWipeData(data[key]); // モバイルでは簡略化
          }
          delete data[key];
        });
      } else if (typeof data === 'string') {
        // 文字列は不変なので、参照を削除するのみ
        data = '';
      }
    } catch (error) {
      // モバイルではログを減らす
      if (!isMobile) {
        securityLogger.logEvent(
          'error_occurred',
          'low',
          'Secure wipe operation failed',
          { dataType: typeof data, error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  }

  /**
   * 深いクローンの作成
   */
  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof ArrayBuffer) {
      return obj.slice(0);
    }

    if (obj instanceof Uint8Array) {
      return new Uint8Array(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClone(item));
    }

    const cloned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }

    return cloned;
  }

  /**
   * 期限切れデータのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    this.protectedStorage.forEach((protectedData, id) => {
      if (protectedData.ttl && now - protectedData.createdAt > protectedData.ttl) {
        expiredIds.push(id);
      }
    });

    expiredIds.forEach(id => {
      this.secureDestroy(id);
    });

    if (expiredIds.length > 0) {
      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'Expired protected data cleaned up',
        { cleanedCount: expiredIds.length }
      );
    }
  }

  /**
   * クリーンアップスケジューラーの開始
   */
  private startCleanupScheduler(): void {
    if (typeof window !== 'undefined') {
      this.cleanupInterval = window.setInterval(() => {
        this.cleanup();
      }, this.cleanupIntervalMs);
    }
  }

  /**
   * 全データの安全な消去
   */
  destroyAll(): void {
    try {
      const ids = Array.from(this.protectedStorage.keys());
      ids.forEach(id => {
        this.secureDestroy(id);
      });

      securityLogger.logEvent(
        'file_upload_accepted' as any,
        'low',
        'All protected data destroyed',
        { destroyedCount: ids.length }
      );
    } catch (error) {
      securityLogger.logEvent(
        'error_occurred',
        'medium',
        'Failed to destroy all protected data',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * メモリ使用状況の取得
   */
  getMemoryStats(): Record<string, any> {
    const stats = {
      totalItems: this.protectedStorage.size,
      totalMemoryEstimate: 0,
      itemsByTTL: {} as Record<string, number>,
      oldestItem: null as string | null,
      newestItem: null as string | null
    };

    let oldestTime = Infinity;
    let newestTime = 0;

    this.protectedStorage.forEach((protectedData, id) => {
      // メモリ使用量の概算
      try {
        const jsonSize = JSON.stringify(protectedData.data).length * 2; // UTF-16での概算
        stats.totalMemoryEstimate += jsonSize;
      } catch (e) {
        // JSON化できないデータは概算で計算
        stats.totalMemoryEstimate += 1024; // 1KB として概算
      }

      // TTL別の統計
      const ttlKey = protectedData.ttl ? `${protectedData.ttl}ms` : 'no-ttl';
      stats.itemsByTTL[ttlKey] = (stats.itemsByTTL[ttlKey] || 0) + 1;

      // 最古・最新アイテムの追跡
      if (protectedData.createdAt < oldestTime) {
        oldestTime = protectedData.createdAt;
        stats.oldestItem = id;
      }
      if (protectedData.createdAt > newestTime) {
        newestTime = protectedData.createdAt;
        stats.newestItem = id;
      }
    });

    return stats;
  }

  /**
   * リソースのクリーンアップ
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.destroyAll();

    securityLogger.logEvent(
      'file_upload_accepted' as any,
      'low',
      'Memory protection system shutdown',
      {}
    );
  }
}

// シングルトンインスタンス
export const memoryProtection = new MemoryProtection();

// ページアンロード時のクリーンアップ
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    memoryProtection.shutdown();
  });

  // メモリ不足時の緊急クリーンアップ
  window.addEventListener('memoryinfo' as any, () => {
    (memoryProtection as any).cleanup();
  });

  // 開発環境でのデバッグ用
  if (process.env.NODE_ENV === 'development') {
    (window as any).memoryProtection = memoryProtection;
  }
}