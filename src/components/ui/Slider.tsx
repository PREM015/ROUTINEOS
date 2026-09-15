"use client";
import React from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className = '', label, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <span className="text-sm text-gray-500">{props.value || props.defaultValue}</span>
          </div>
        )}
        <input
          type="range"
          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${className}`}
          ref={ref}
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = 'Slider';
