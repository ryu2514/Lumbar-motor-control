import { useState, useCallback, useRef } from 'react';

// 条件付きインポート
let dataProtection: any = {
  secureDelete: () => {},
  anonymizeFileName: (name: string) => name
};

// 動的インポートでモジュールを読み込み
if (typeof window !== 'undefined') {
  import('../utils/dataProtection')
    .then(module => {
      dataProtection = module.dataProtection;
    })
    .catch(error => {
      console.warn('Data protection not available:', error);
    });
}

export interface TimeSeriesDataPoint {
  timestamp: number;
  time: number; // 経過時間（秒）
  lumbarAngle: number; // 腰椎過剰運動量（°）
  status: 'normal' | 'caution' | 'abnormal';
}

export interface TimeSeriesData {
  data: TimeSeriesDataPoint[];
  startTime: number | null;
  isRecording: boolean;
  duration: number;
}

/**
 * 時系列データ管理用のカスタムフック
 */
export const useTimeSeriesData = () => {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData>({
    data: [],
    startTime: null,
    isRecording: false,
    duration: 0
  });
  
  const intervalRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const maxDataPoints = useRef<number>(300); // 最大5分間（1秒間隔）のデータを保持
  
  // モバイル検出
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // データ記録開始
  const startRecording = useCallback(() => {
    const now = Date.now();
    console.log('🎬 記録開始:', { 開始時刻: new Date(now).toLocaleTimeString() });
    
    setTimeSeriesData(prev => ({
      ...prev,
      startTime: now,
      isRecording: true,
      data: [], // 新しい記録開始時にデータをクリア
      duration: 0
    }));
  }, []);

  // データ記録停止
  const stopRecording = useCallback(() => {
    console.log('⏸️ 記録停止');
    
    setTimeSeriesData(prev => ({
      ...prev,
      isRecording: false
    }));
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // データポイント追加（モバイル最適化）
  const addDataPoint = useCallback((excessiveMovement: number) => {
    // モバイルでは更新頻度を制限
    const now = Date.now();
    if (isMobile && now - lastUpdateRef.current < 200) { // 200ms間隔で制限
      return;
    }
    lastUpdateRef.current = now;
    
    setTimeSeriesData(prev => {
      if (!prev.isRecording || prev.startTime === null) {
        return prev;
      }

      const now = Date.now();
      const timeElapsed = (now - prev.startTime) / 1000; // 秒に変換

      // 腰椎過剰運動量による状態判定（useMetrics.tsと統一）
      let status: 'normal' | 'caution' | 'abnormal' = 'normal';
      if (excessiveMovement >= 15) {
        status = 'abnormal';  // 15°以上で異常
      } else if (excessiveMovement >= 8) {
        status = 'caution';   // 8-15°で注意
      }
      // 0-8°で正常

      const newDataPoint: TimeSeriesDataPoint = {
        timestamp: now,
        time: timeElapsed,
        lumbarAngle: excessiveMovement,
        status
      };

      // データポイントの数を制限
      const updatedData = [...prev.data, newDataPoint];
      if (updatedData.length > maxDataPoints.current) {
        updatedData.shift(); // 古いデータを削除
      }

      console.log('✅ 新しいデータポイント追加:', {
        時間: timeElapsed.toFixed(1),
        角度: excessiveMovement.toFixed(1),
        状態: status,
        新データ数: updatedData.length
      });

      return {
        ...prev,
        data: updatedData,
        duration: timeElapsed
      };
    });
  }, []);

  // データクリア
  const clearData = useCallback(() => {
    // 既存データの安全な消去
    setTimeSeriesData(prev => {
      if (prev.data.length > 0 && dataProtection && dataProtection.secureDelete) {
        try {
          dataProtection.secureDelete(prev.data);
        } catch (error) {
          console.warn('Secure delete failed:', error);
        }
      }
      return {
        data: [],
        startTime: null,
        isRecording: false,
        duration: 0
      };
    });
    
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // データエクスポート（CSV形式）
  const exportData = useCallback(() => {
    const { data } = timeSeriesData;
    if (data.length === 0) return;

    const csvHeader = 'Time(s),Excessive Movement(°),Status\n';
    const csvContent = data
      .map(point => `${point.time.toFixed(1)},${point.lumbarAngle.toFixed(1)},${point.status}`)
      .join('\n');
    
    const csvData = csvHeader + csvContent;
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    
    // ダウンロード
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    // 匿名化されたファイル名を使用
    let anonymizedFileName = `lumbar-excessive-movement-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    try {
      if (dataProtection && dataProtection.anonymizeFileName) {
        anonymizedFileName = dataProtection.anonymizeFileName(anonymizedFileName);
      }
    } catch (error) {
      console.warn('File name anonymization failed:', error);
    }
    link.setAttribute('download', anonymizedFileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // セキュアなクリーンアップ
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (dataProtection && dataProtection.secureDelete) {
        try {
          dataProtection.secureDelete(blob);
        } catch (error) {
          console.warn('Secure blob delete failed:', error);
        }
      }
    }, 100);
  }, [timeSeriesData]);

  // 統計データの計算
  const getStatistics = useCallback(() => {
    const { data } = timeSeriesData;
    if (data.length === 0) {
      return {
        mean: 0,
        max: 0,
        min: 0,
        range: 0,
        normalPercentage: 0,
        cautionPercentage: 0,
        abnormalPercentage: 0
      };
    }

    const angles = data.map(d => d.lumbarAngle);
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    const max = Math.max(...angles);
    const min = Math.min(...angles);
    const range = max - min;

    const normalCount = data.filter(d => d.status === 'normal').length;
    const cautionCount = data.filter(d => d.status === 'caution').length;
    const abnormalCount = data.filter(d => d.status === 'abnormal').length;

    return {
      mean: Number(mean.toFixed(1)),
      max: Number(max.toFixed(1)),
      min: Number(min.toFixed(1)),
      range: Number(range.toFixed(1)),
      normalPercentage: Number(((normalCount / data.length) * 100).toFixed(1)),
      cautionPercentage: Number(((cautionCount / data.length) * 100).toFixed(1)),
      abnormalPercentage: Number(((abnormalCount / data.length) * 100).toFixed(1))
    };
  }, [timeSeriesData]);

  return {
    timeSeriesData,
    startRecording,
    stopRecording,
    addDataPoint,
    clearData,
    exportData,
    getStatistics
  };
};