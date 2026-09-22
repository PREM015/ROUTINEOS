'use client';

interface Props {
  label: string;
  value: number;
  previousValue: number;
  unit?: string;
}

export default function TrendCard({ label, value, previousValue, unit = '' }: Props) {
  const diff = value - previousValue;
  const percentChange = previousValue === 0 ? 0 : (diff / previousValue) * 100;
  const isPositive = diff >= 0;
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col">
      <span className="text-sm text-gray-500 mb-1">{label}</span>
      <div className="flex items-end space-x-2">
        <span className="text-2xl font-bold text-gray-800">{value}{unit}</span>
        <div className={`flex items-center text-sm font-medium pb-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          <span>{isPositive ? '↑' : '↓'}</span>
          <span>{Math.abs(percentChange).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
