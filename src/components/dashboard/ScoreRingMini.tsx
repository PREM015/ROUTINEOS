'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ScoreRingMiniProps {
  score: number;
  color: string;
  label: string;
  size?: number;
}

export default function ScoreRingMini({ score, color, label, size = 64 }: ScoreRingMiniProps) {
  const strokeWidth = size * 0.12;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          <circle 
            cx={center} 
            cy={center} 
            r={radius} 
            fill="none" 
            strokeWidth={strokeWidth} 
            className="stroke-zinc-800" 
          />
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ stroke: color }}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-zinc-100 font-bold" style={{ fontSize: size * 0.25 }}>
            {score}
          </span>
        </div>
      </div>
      <span className="text-zinc-400 text-xs font-medium mt-2">{label}</span>
    </div>
  );
}
