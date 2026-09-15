'use client';
import React from 'react';

interface EnergySelectorProps {
  value: number;
  onChange: (v: number) => void;
}

export function EnergySelector({ value, onChange }: EnergySelectorProps) {
  const labels = ['Exhausted', 'Low', 'Moderate', 'Good', 'Energized'];

  return (
    <div className="flex flex-col items-center md:items-start">
      <div className="flex gap-2 mb-2">
        {[1, 2, 3, 4, 5].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`text-2xl transition-transform hover:scale-110 ${v <= value ? 'text-yellow-500' : 'text-gray-300 grayscale'}`}
            title={labels[v - 1]}
          >
            ⚡
          </button>
        ))}
      </div>
      <span className="text-sm text-gray-600 font-medium">{labels[value - 1] || 'Select Energy'}</span>
    </div>
  );
}
