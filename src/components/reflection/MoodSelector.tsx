'use client';

interface MoodSelectorProps {
  value: number;
  onChange: (v: number) => void;
}

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  const emojis = ['😞', '😕', '😐', '🙂', '😄'];
  const labels = ['Awful', 'Poor', 'Okay', 'Good', 'Great'];

  return (
    <div className="flex flex-col items-center md:items-start">
      <div className="flex gap-2 mb-2">
        {emojis.map((emoji, i) => {
          const v = i + 1;
          const isSelected = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`text-3xl transition-transform ${isSelected ? 'scale-125 opacity-100' : 'opacity-40 hover:opacity-70 grayscale'}`}
              title={labels[i]}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      <span className="text-sm text-gray-600 font-medium">{labels[value - 1] || 'Select Mood'}</span>
    </div>
  );
}
