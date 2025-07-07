import React, { useMemo, useEffect, useState, memo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart
} from 'recharts';
import type { TimeSeriesDataPoint } from '../hooks/useTimeSeriesData';

interface LumbarExcessiveMovementChartProps {
  data: TimeSeriesDataPoint[];
  isRecording: boolean;
  duration: number;
}

interface Statistics {
  mean: number;
  max: number;
  min: number;
  range: number;
  normalPercentage: number;
  cautionPercentage: number;
  abnormalPercentage: number;
}

interface LumbarExcessiveMovementChartWithStatsProps extends LumbarExcessiveMovementChartProps {
  statistics: Statistics;
  onExport: () => void;
  onClear: () => void;
}

// カスタムツールチップコンポーネント
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
        <p className="text-sm font-medium">{`時間: ${Number(label).toFixed(1)}秒`}</p>
        <p className="text-sm" style={{ color: payload[0].color }}>
          {`過剰運動量: ${data.lumbarAngle.toFixed(1)}°`}
        </p>
        <p className="text-xs text-gray-600">
          ステータス: {data.status === 'normal' ? '正常' : data.status === 'caution' ? '注意' : '異常'}
        </p>
      </div>
    );
  }
  return null;
};

// ポイントの色を状態に応じて変更する関数（日本整形外科学会基準）
const getPointColor = (status: string) => {
  switch (status) {
    case 'normal': return '#10b981'; // green-500
    case 'caution': return '#f59e0b'; // yellow-500  
    case 'abnormal': return '#ef4444'; // red-500
    default: return '#6b7280'; // gray-500
  }
};

// CustomDotコンポーネントは使用されていないため削除

export const LumbarExcessiveMovementChart: React.FC<LumbarExcessiveMovementChartProps> = memo(({
  data,
  isRecording,
  duration
}) => {
  // モバイルデバイス検出
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // データの有効性チェック（モバイル最適化）
  const validData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    
    // データの妥当性をチェック
    const filteredData = data.filter(point => 
      point && 
      typeof point.time === 'number' && 
      typeof point.lumbarAngle === 'number' && 
      !isNaN(point.time) && 
      !isNaN(point.lumbarAngle)
    );
    
    // モバイルではさらにデータ量を制限してパフォーマンス向上
    const maxDataPoints = isMobile ? 100 : 300; // モバイルで100ポイントにさらに減らす
    const step = Math.max(1, Math.floor(filteredData.length / maxDataPoints));
    
    // モバイルではさらに関間引きして最新データを優先
    if (isMobile && filteredData.length > maxDataPoints) {
      const recent = filteredData.slice(-maxDataPoints);
      return recent.filter((_, index) => index % 2 === 0); // 2倍の間引き
    }
    
    return filteredData.filter((_, index) => index % step === 0);
  }, [data, isMobile]);
  
  // Y軸の動的範囲計算（モバイル最適化）
  const yAxisDomain = useMemo(() => {
    if (validData.length === 0) return [0, 20];
    
    const angles = validData.map(d => d.lumbarAngle);
    const filteredAngles = angles.filter(angle => angle >= -50 && angle <= 100);
    
    if (filteredAngles.length === 0) return [0, 20];
    
    const maxAngle = Math.max(...filteredAngles);
    const minAngle = Math.min(...filteredAngles);
    
    // 実用的な範囲に調整
    let yMin = Math.max(0, Math.floor(minAngle) - 2);
    let yMax = Math.ceil(maxAngle) + 5;
    
    // 最小範囲を確保
    if (yMax - yMin < 10) {
      const center = (yMax + yMin) / 2;
      yMin = Math.max(0, center - 5);
      yMax = center + 5;
    }
    
    // 最大範囲制限
    if (yMax > 50) yMax = 50;
    
    return [yMin, yMax];
  }, [validData]);
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">腰椎過剰運動量 時系列グラフ</h3>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>
            <div className={`w-2 h-2 rounded-full mr-1 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span className="text-sm">
              {isRecording ? '記録中' : '停止中'} ({duration.toFixed(1)}s)
            </span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: isMobile ? '250px' : '300px' }}>
        {validData.length > 0 ? (
          <ResponsiveContainer>
            <ComposedChart 
              data={validData} 
              margin={{ top: 20, right: isMobile ? 10 : 30, left: isMobile ? 10 : 20, bottom: 5 }}
            >
              {!isMobile && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
              <XAxis 
                dataKey="time" 
                type="number"
                scale="linear"
                domain={['dataMin', 'dataMax']}
                tickFormatter={isMobile ? undefined : (value) => `${value.toFixed(1)}s`}
                stroke="#6b7280"
                tick={isMobile ? { fontSize: 10 } : undefined}
                interval={isMobile ? 'preserveStartEnd' : 'preserveStart'}
              />
              <YAxis 
                domain={yAxisDomain}
                tickFormatter={isMobile ? undefined : (value) => `${value}°`}
                stroke="#6b7280"
                tick={isMobile ? { fontSize: 10 } : undefined}
                width={isMobile ? 30 : 60}
              />
              {!isMobile && <Tooltip content={<CustomTooltip />} />}
              
              {/* 腰椎過剰運動量の基準線（モバイルでは簡略化） */}
              {!isMobile && (
                <>
                  <ReferenceLine y={8} stroke="#10b981" strokeDasharray="1 1" opacity={0.7} />
                  <ReferenceLine y={15} stroke="#f59e0b" strokeDasharray="2 2" opacity={0.8} />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="1 1" opacity={0.3} />
                </>
              )}
              
              {/* メインライン（モバイル最適化） */}
              <Line 
                type={isMobile ? "linear" : "monotone"}
                dataKey="lumbarAngle" 
                stroke="#3b82f6"
                strokeWidth={isMobile ? 1 : 2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-lg">📊</div>
              <div className="text-sm mt-2">
                {isRecording ? 'データ収集中...' : 'データがありません'}
              </div>
              <div className="text-xs mt-1">
                有効データ数: {validData.length}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 凡例（調整済み） */}
      <div className="mt-4 flex flex-wrap justify-center space-x-6 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
          <span>正常 (0-8°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></div>
          <span>注意 (8-15°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
          <span>異常 (15°以上)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-gray-500 mr-1"></div>
          <span>基準線 (0°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-green-500 mr-1" style={{ borderTop: '1px dashed' }}></div>
          <span>正常上限 (8°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-yellow-500 mr-1" style={{ borderTop: '1px dashed' }}></div>
          <span>注意境界 (15°)</span>
        </div>
      </div>
      
      {/* 注意事項 */}
      <div className="mt-3 p-2 bg-blue-50 border-l-4 border-blue-400 text-xs text-gray-600">
        <strong>説明:</strong> 腰椎過剰運動量は中立位からの偏差を測定し、テスト別にオフセット調整されています。0°に近いほど良好な腰椎制御を示します。
      </div>
    </div>
  );
});

export const LumbarExcessiveMovementChartWithStats: React.FC<LumbarExcessiveMovementChartWithStatsProps> = memo(({
  data,
  isRecording,
  duration,
  statistics,
  onExport,
  onClear
}) => {
  return (
    <div className="space-y-4">
      <LumbarExcessiveMovementChart data={data} isRecording={isRecording} duration={duration} />
      
      {/* 統計情報 */}
      {data.length > 0 && (
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-medium">統計情報</h4>
            <div className="space-x-2">
              <button
                onClick={onExport}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                disabled={data.length === 0}
              >
                CSVエクスポート
              </button>
              <button
                onClick={onClear}
                className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
              >
                データクリア
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{statistics.mean}°</div>
              <div className="text-gray-600">平均</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-600">{statistics.max}°</div>
              <div className="text-gray-600">最大</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{statistics.min}°</div>
              <div className="text-gray-600">最小</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">{statistics.range}°</div>
              <div className="text-gray-600">範囲</div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div className="text-center p-2 bg-green-50 rounded">
              <div className="text-lg font-bold text-green-600">{statistics.normalPercentage}%</div>
              <div className="text-gray-600">正常範囲</div>
            </div>
            <div className="text-center p-2 bg-yellow-50 rounded">
              <div className="text-lg font-bold text-yellow-600">{statistics.cautionPercentage}%</div>
              <div className="text-gray-600">注意範囲</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded">
              <div className="text-lg font-bold text-red-600">{statistics.abnormalPercentage}%</div>
              <div className="text-gray-600">異常範囲</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});