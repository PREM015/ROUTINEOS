'use client';

interface DailyWinProps {
  win?: string | null;
  onEdit: () => void;
}

export function DailyWin({ win, onEdit }: DailyWinProps) {
  return (
    <div className="p-4 border border-yellow-200 rounded-lg bg-gradient-to-r from-yellow-50 to-orange-50 shadow-sm relative">
      <div className="absolute top-4 right-4">
        <button 
          onClick={onEdit}
          className="text-xs text-yellow-600 hover:text-yellow-800 font-medium"
        >
          {win ? 'Edit' : 'Add'}
        </button>
      </div>
      <div className="flex items-start gap-3 pr-10">
        <div className="text-2xl pt-1">⭐</div>
        <div>
          <h4 className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-1">Today's Biggest Win</h4>
          {win ? (
            <p className="text-gray-800 leading-relaxed">{win}</p>
          ) : (
            <p className="text-gray-500 italic text-sm">No win logged yet. Reflect on your day!</p>
          )}
        </div>
      </div>
    </div>
  );
}
