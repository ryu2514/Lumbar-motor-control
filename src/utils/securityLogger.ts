/**
 * セキュリティログ管理ユーティリティ
 */

export type SecurityEventType = 
  | 'file_upload_rejected'
  | 'file_upload_warning'
  | 'invalid_data_detected'
  | 'csp_violation'
  | 'error_occurred'
  | 'suspicious_activity';

export interface SecurityEvent {
  timestamp: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, any>;
  userAgent?: string;
  url?: string;
}

class SecurityLogger {
  private events: SecurityEvent[] = [];
  private maxEvents = 1000; // メモリ使用量制限
  private alertThreshold = 10; // 同一タイプのイベントが10回発生でアラート

  /**
   * セキュリティイベントをログに記録
   */
  logEvent(
    type: SecurityEventType,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    details?: Record<string, any>
  ): void {
    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      message,
      details: details ? this.sanitizeDetails(details) : undefined,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    this.events.push(event);
    
    // メモリ使用量制限
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // コンソールログ出力
    this.logToConsole(event);
    
    // アラート判定
    this.checkForAlerts(type);
  }

  /**
   * 詳細情報のサニタイズ
   */
  private sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        // 敏感な情報をマスク
        sanitized[key] = this.maskSensitiveData(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * 敏感な情報をマスクする
   */
  private maskSensitiveData(value: string): string {
    // パスワード、トークン、キーなどの敏感な情報をマスク
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /key/i,
      /secret/i,
      /auth/i
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(value)) {
        return '[MASKED]';
      }
    }
    
    return value;
  }

  /**
   * コンソールログ出力
   */
  private logToConsole(event: SecurityEvent): void {
    const emoji = this.getSeverityEmoji(event.severity);
    const prefix = `${emoji} [SECURITY:${event.type.toUpperCase()}]`;
    
    switch (event.severity) {
      case 'critical':
        console.error(prefix, event.message, event.details);
        break;
      case 'high':
        console.warn(prefix, event.message, event.details);
        break;
      case 'medium':
        console.info(prefix, event.message, event.details);
        break;
      case 'low':
        console.debug(prefix, event.message, event.details);
        break;
    }
  }

  /**
   * 重要度に応じた絵文字を取得
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return 'ℹ️';
      case 'low': return '🔍';
      default: return '📝';
    }
  }

  /**
   * アラート判定
   */
  private checkForAlerts(type: SecurityEventType): void {
    const recentEvents = this.events.filter(
      event => event.type === type && 
      new Date(event.timestamp).getTime() > Date.now() - 60000 // 1分以内
    );

    if (recentEvents.length >= this.alertThreshold) {
      this.logEvent(
        'suspicious_activity',
        'high',
        `異常なアクティビティを検出: ${type}が1分間に${recentEvents.length}回発生`,
        { eventType: type, count: recentEvents.length }
      );
    }
  }

  /**
   * ログの取得（デバッグ用）
   */
  getEvents(
    type?: SecurityEventType,
    severity?: 'low' | 'medium' | 'high' | 'critical',
    limit?: number
  ): SecurityEvent[] {
    let filtered = this.events;
    
    if (type) {
      filtered = filtered.filter(event => event.type === type);
    }
    
    if (severity) {
      filtered = filtered.filter(event => event.severity === severity);
    }
    
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered;
  }

  /**
   * ログの統計情報を取得
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      total: this.events.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      last24Hours: 0
    };

    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;

    this.events.forEach(event => {
      // タイプ別統計
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
      
      // 重要度別統計
      stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;
      
      // 過去24時間の統計
      if (new Date(event.timestamp).getTime() > last24Hours) {
        stats.last24Hours++;
      }
    });

    return stats;
  }

  /**
   * CSP違反のログ記録
   */
  logCSPViolation(violationReport: any): void {
    this.logEvent(
      'csp_violation',
      'high',
      'Content Security Policy violation detected',
      {
        blockedURI: violationReport.blockedURI,
        violatedDirective: violationReport.violatedDirective,
        originalPolicy: violationReport.originalPolicy
      }
    );
  }

  /**
   * ログのエクスポート（デバッグ用）
   */
  exportLogs(): string {
    return JSON.stringify(this.events, null, 2);
  }

  /**
   * ログのクリア
   */
  clearLogs(): void {
    this.events = [];
  }
}

// シングルトンインスタンス
export const securityLogger = new SecurityLogger();

// CSP違反のリスナー設定
if (typeof window !== 'undefined') {
  document.addEventListener('securitypolicyviolation', (e) => {
    securityLogger.logCSPViolation(e);
  });
}

// 開発環境でのデバッグ用
if (process.env.NODE_ENV === 'development') {
  (window as any).securityLogger = securityLogger;
}