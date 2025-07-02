import React from 'react';
import type { Metric } from '../types';

interface ExtendedMetric extends Metric {
  previousValue?: number;
  change?: number | null;
  isImprovement?: boolean;
}

interface ProgressTrackerProps {
  metrics: Metric[];
  previousMetrics?: Metric[];
}

/**
 * 評価指標の前回との比較を表示する進捗トラッカー
 */
const ProgressTracker: React.FC<ProgressTrackerProps> = ({ metrics, previousMetrics }) => {
  // 前回のメトリクスがない場合
  if (!previousMetrics || previousMetrics.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg shadow">
        <h2 className="text-lg font-bold mb-3 text-blue-800">進捗状況</h2>
        <div className="text-gray-500 italic">
          <p>前回の測定データがありません。</p>
          <p>複数回の測定後に進捗状況が表示されます。</p>
        </div>
      </div>
    );
  }

  // 前回と今回のデータを比較
  const compareMetrics = (current: Metric[], previous: Metric[]): ExtendedMetric[] => {
    return current.map(currentMetric => {
      const prevMetric = previous.find(p => p.label === currentMetric.label);
      
      if (!prevMetric) return { ...currentMetric, change: null };
      
      const change = currentMetric.value - prevMetric.value;
      const isImprovement = getIsImprovement(currentMetric.label, change);
      
      return {
        ...currentMetric,
        previousValue: prevMetric.value,
        change,
        isImprovement
      };
    });
  };

  // 指標の種類に基づいて変化が改善かどうかを判定
  const getIsImprovement = (label: string, change: number): boolean => {
    // 値が大きい方が良い指標（角度、安定性など）
    const higherIsBetter = [
      '股関節屈曲角度',
      '膝関節伸展角度',
      '腰椎カーブ維持'
    ];
    
    // 値が小さい方が良い指標（傾き、ズレなど）
    const lowerIsBetter = [
      '腰椎屈曲角度',
      '股関節-腰椎リズム',
      '骨盤制御',
      '骨盤安定性',
      '腰椎アライメント',
      '左右対称性'
    ];
    
    if (higherIsBetter.some(item => label.includes(item))) {
      return change > 0;
    }
    
    if (lowerIsBetter.some(item => label.includes(item))) {
      return change < 0;
    }
    
    return false; // デフォルトでは変化なしとする
  };
  
  // 変化率をパーセントで表示
  const getChangePercentage = (current: number, previous: number): string => {
    if (previous === 0) return '−';
    const percentage = ((current - previous) / Math.abs(previous)) * 100;
    return `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`;
  };

  const comparedMetrics: ExtendedMetric[] = compareMetrics(metrics, previousMetrics);

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow">
      <h2 className="text-lg font-bold mb-3 text-blue-800">進捗状況</h2>
      
      <div className="space-y-3">
        {comparedMetrics.map((metric, index) => (
          <div key={index} className="border rounded-md p-3 bg-white">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">{metric.label}</span>
              {metric.change !== null && (
                <span className={`px-2 py-1 text-xs rounded-full ${
                  metric.isImprovement 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {metric.isImprovement ? '改善' : '要注意'}
                </span>
              )}
            </div>
            
            {'previousValue' in metric && metric.previousValue !== undefined && (
              <div className="flex items-center justify-between">
                <div className="flex items-baseline space-x-2">
                  <span className="text-gray-500 text-sm">前回:</span>
                  <span className="font-medium">{metric.previousValue}</span>
                  <span className="text-xs text-gray-500">{metric.unit}</span>
                </div>
                
                <div className="flex items-baseline space-x-2">
                  <span className="text-gray-500 text-sm">今回:</span>
                  <span className="font-bold">{metric.value}</span>
                  <span className="text-xs text-gray-500">{metric.unit}</span>
                </div>
                
                <div className="flex items-baseline">
                  <span className={`font-medium ${
                    metric.change === 0
                      ? 'text-gray-500'
                      : metric.isImprovement === true
                        ? 'text-green-600'
                        : 'text-orange-600'
                  }`}>
                    {metric.change && metric.change > 0 ? '+' : ''}{metric.change?.toFixed(1)} {metric.unit}
                  </span>
                  <span className="text-xs text-gray-500 ml-1">
                    ({getChangePercentage(metric.value, metric.previousValue)})
                  </span>
                </div>
              </div>
            )}
            
            {metric.isImprovement === true && (
              <div className="mt-2 text-sm text-green-700 bg-green-50 p-2 rounded">
                <strong>進捗:</strong> {metric.label}が改善しています。継続的なトレーニングが効果的です。
              </div>
            )}
            
            {metric.change !== null && metric.isImprovement === false && (
              <div className="mt-2 text-sm text-orange-700 bg-orange-50 p-2 rounded">
                <strong>注意:</strong> {metric.label}に課題があります。トレーニング方法の調整を検討してください。
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <p>※ これらの評価は自動計算された結果です。詳細な評価には専門家の判断が必要です。</p>
      </div>
    </div>
  );
};

export default ProgressTracker;
