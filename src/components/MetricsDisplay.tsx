import React from 'react';
import type { Metric } from '../types';

interface MetricsDisplayProps {
  metrics: Metric[];
}

/**
 * 計測された指標を表示するコンポーネント
 */
const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  // ステータスに基づく色分け
  const getStatusColor = (status: 'normal' | 'caution' | 'abnormal'): string => {
    switch (status) {
      case 'normal':
        return 'bg-green-100 text-green-800';
      case 'caution':
        return 'bg-yellow-100 text-yellow-800';
      case 'abnormal':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // ステータスに基づくラベル
  const getStatusLabel = (status: 'normal' | 'caution' | 'abnormal'): string => {
    switch (status) {
      case 'normal':
        return '正常';
      case 'caution':
        return '注意';
      case 'abnormal':
        return '異常';
      default:
        return '---';
    }
  };

  // 臨床ノートの取得
  const getClinicalNote = (metric: Metric): string => {
    const { label, status } = metric;

    if (status === 'normal') {
      return `${label}は正常範囲内です。`;
    }

    // 各指標タイプと状態に基づいた臨床ノート
    if (label.includes('股関節屈曲角度')) {
      if (status === 'abnormal') {
        return '股関節屈曲が制限されています。股関節の柔軟性トレーニングが推奨されます。';
      }
      return '股関節屈曲がやや制限されています。可動域を広げるエクササイズが有効かもしれません。';
    }

    if (label.includes('腰椎')) {
      if (status === 'abnormal') {
        return '腰椎の過剰な動きが見られます。腰部深層筋のトレーニングが推奨されます。';
      }
      return '腰椎の安定性にやや課題があります。コアスタビリティトレーニングを検討してください。';
    }

    if (label.includes('リズム') || label.includes('協調性')) {
      if (status === 'abnormal') {
        return '運動協調性に問題があります。神経筋コントロールトレーニングが必要です。';
      }
      return '運動協調性にやや課題があります。運動学習を促進するエクササイズを検討してください。';
    }


    if (label.includes('安定性')) {
      if (status === 'abnormal') {
        return '安定性に問題があります。特異的な安定化トレーニングが必要です。';
      }
      return '安定性にやや課題があります。コアトレーニングにより改善する可能性があります。';
    }

    if (label.includes('対称性')) {
      if (status === 'abnormal') {
        return '左右の対称性に問題があります。バランストレーニングが推奨されます。';
      }
      return '左右のバランスにやや課題があります。両側トレーニングを検討してください。';
    }


    // デフォルトのノート
    return status === 'abnormal'
      ? `${label}に問題があります。改善のための特異的なトレーニングを検討してください。`
      : `${label}にやや課題があります。継続的な観察が推奨されます。`;
  };

  if (!metrics.length) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg shadow">
        <p className="text-gray-500 italic">
          ビデオを再生すると、測定された指標がここに表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg shadow">
      <h2 className="text-lg font-bold mb-3 text-blue-800">評価指標</h2>
      
      <div className="space-y-4">
        {metrics.map((metric, index) => (
          <div key={index} className="border rounded-md p-3 bg-white">
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">{metric.label}</span>
              <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(metric.status)}`}>
                {getStatusLabel(metric.status)}
              </span>
            </div>
            
            <div className="flex items-baseline mb-2">
              <span className="text-2xl font-bold">{metric.value}</span>
              <span className="ml-1 text-gray-600">{metric.unit}</span>
              <span className="ml-2 text-xs text-gray-500">
                (正常範囲: {metric.normalRange})
              </span>
            </div>
            
            <div className="mt-2 text-sm">
              <div className="text-gray-600">{metric.description}</div>
              {metric.status !== 'normal' && (
                <div className="mt-1 text-gray-700 bg-gray-50 p-2 rounded border-l-4 border-blue-500">
                  <strong className="text-blue-700">臨床ノート:</strong> {getClinicalNote(metric)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <p>※ これらの評価は自動計算された結果です。詳細な評価には専門家の判断が必要です。</p>
      </div>
    </div>
  );
};

export default MetricsDisplay;
