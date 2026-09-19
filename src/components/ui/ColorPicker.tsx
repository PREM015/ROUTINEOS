"use client";

/**
 * ColorPicker — a controlled color selector combining a native color
 * swatch, a freeform hex text field and clickable preset swatches.
 *
 * Usage:
 *   <ColorPicker value={color} onChange={setColor} presets={['#3b82f6', '#22c55e']} />
 */
import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_PRESETS: readonly string[] = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
  '#111827',
  '#ffffff',
];

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidHex(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

export interface ColorPickerProps {
  /** Current color, expected as a 6-digit hex string like `#3b82f6`. */
  value: string;
  onChange: (color: string) => void;
  /** List of swatch colors offered below the input. */
  presets?: readonly string[];
  label?: string;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  label,
  className,
}: ColorPickerProps) {
  const [textValue, setTextValue] = React.useState(value);

  React.useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setTextValue(next);
    if (isValidHex(next)) {
      const normalized = next.length === 4 ? expandShortHex(next) : next.toLowerCase();
      onChange(normalized);
    }
  };

  return (
    <div className={cn('w-full space-y-3', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-300 shadow-sm">
          <input
            type="color"
            value={isValidHex(value) ? value.toLowerCase() : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label ? `${label} color picker` : 'Pick a color'}
            className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer border-0 bg-transparent p-0"
          />
        </div>
        <input
          type="text"
          value={textValue}
          onChange={handleTextChange}
          placeholder="#000000"
          spellCheck={false}
          aria-invalid={textValue.length > 0 && !isValidHex(textValue)}
          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 aria-invalid:border-red-400"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const selected = preset.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              title={preset}
              aria-label={`Select color ${preset}`}
              aria-pressed={selected}
              style={{ backgroundColor: preset }}
              className="relative h-6 w-6 rounded-full border border-gray-200 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {selected && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function expandShortHex(value: string): string {
  return (
    '#' +
    value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')
  );
}