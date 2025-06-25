import React from 'react';
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

interface LumbarAngleChartProps {
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

interface LumbarAngleChartWithStatsProps extends LumbarAngleChartProps {
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
          {`角度: ${data.lumbarAngle.toFixed(1)}°`}
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

// カスタムドットコンポーネント
const CustomDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload) return null;
  
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2}
      fill={getPointColor(payload.status)}
      stroke={getPointColor(payload.status)}
      strokeWidth={1}
    />
  );
};

export const LumbarAngleChart: React.FC<LumbarAngleChartProps> = ({
  data,
  isRecording,
  duration
}) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">胸腰椎角度 時系列グラフ</h3>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>
            <div className={`w-2 h-2 rounded-full mr-1 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}></div>
            <span className="text-sm">
              {isRecording ? '記録中' : '停止中'} ({duration.toFixed(1)}s)
            </span>
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: '300px' }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="time" 
              type="number"
              scale="linear"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(1)}s`}
              stroke="#6b7280"
            />
            <YAxis 
              domain={[-90, 90]}
              tickFormatter={(value) => `${value}°`}
              stroke="#6b7280"
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* 日本整形外科学会基準の基準線 */}
            <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="2 2" opacity={0.7} />
            <ReferenceLine y={-20} stroke="#f59e0b" strokeDasharray="2 2" opacity={0.7} />
            <ReferenceLine y={45} stroke="#ef4444" strokeDasharray="2 2" opacity={0.7} />
            <ReferenceLine y={-30} stroke="#ef4444" strokeDasharray="2 2" opacity={0.7} />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="1 1" opacity={0.5} />
            
            {/* メインライン */}
            <Line 
              type="monotone" 
              dataKey="lumbarAngle" 
              stroke="#3b82f6"
              strokeWidth={2}
              dot={<CustomDot />}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 凡例 */}
      <div className="mt-4 flex flex-wrap justify-center space-x-6 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-gray-400 mr-1"></div>
          <span>基準線 (0°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-yellow-500 mr-1" style={{ borderTop: '1px dashed' }}></div>
          <span>注意範囲 (屈曲30°/伸展20°)</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-red-500 mr-1" style={{ borderTop: '1px dashed' }}></div>
          <span>異常範囲 (屈曲45°/伸展30°)</span>
        </div>
      </div>
      
      {/* 注意事項 */}
      <div className="mt-3 p-2 bg-yellow-50 border-l-4 border-yellow-400 text-xs text-gray-600">
        <strong>注意:</strong> 胸腰椎一括測定のため誤差が生じやすく、骨盤前傾時は腰椎伸展として検出される傾向があります。
      </div>
    </div>
  );
};

export const LumbarAngleChartWithStats: React.FC<LumbarAngleChartWithStatsProps> = ({
  data,
  isRecording,
  duration,
  statistics,
  onExport,
  onClear
}) => {
  return (
    <div className="space-y-4">
      <LumbarAngleChart data={data} isRecording={isRecording} duration={duration} />
      
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
};