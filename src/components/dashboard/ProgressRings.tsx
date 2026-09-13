'use client';

import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

interface ProgressRingsProps {
  coreScore: number | null;     // 0-100 — emerald-500 ring
  growthScore: number | null;   // 0-100 — teal-400 ring
  bonusScore: number | null;    // 0-100 — amber-500 ring
  size?: number;         // default 200
  animated?: boolean;
}

export default function ProgressRings({
  coreScore,
  growthScore,
  bonusScore,
  size = 200,
  animated = true,
}: ProgressRingsProps) {
  const safeCoreScore = coreScore ?? 0;
  const safeGrowthScore = growthScore ?? 0;
  const safeBonusScore = bonusScore ?? 0;
  const strokeWidth = size * 0.08;
  const gap = size * 0.02;
  const center = size / 2;

  // Radii
  const rCore = center - strokeWidth / 2;
  const rGrowth = rCore - strokeWidth - gap;
  const rBonus = rGrowth - strokeWidth - gap;

  // Circumferences
  const cCore = 2 * Math.PI * rCore;
  const cGrowth = 2 * Math.PI * rGrowth;
  const cBonus = 2 * Math.PI * rBonus;

  // Dash offsets
  const oCore = cCore - (safeCoreScore / 100) * cCore;
  const oGrowth = cGrowth - (safeGrowthScore / 100) * cGrowth;
  const oBonus = cBonus - (safeBonusScore / 100) * cBonus;

  const coreCount = useMotionValue(0);
  const growthCount = useMotionValue(0);
  const bonusCount = useMotionValue(0);

  const roundedCore = useTransform(coreCount, (latest) => Math.round(latest));
  const roundedGrowth = useTransform(growthCount, (latest) => Math.round(latest));
  const roundedBonus = useTransform(bonusCount, (latest) => Math.round(latest));

  useEffect(() => {
    if (animated) {
      animate(coreCount, safeCoreScore, { duration: 1, type: 'spring', bounce: 0.2 });
      animate(growthCount, safeGrowthScore, { duration: 1, type: 'spring', bounce: 0.2 });
      animate(bonusCount, safeBonusScore, { duration: 1, type: 'spring', bounce: 0.2 });
    } else {
      coreCount.set(safeCoreScore);
      growthCount.set(safeGrowthScore);
      bonusCount.set(safeBonusScore);
    }
  }, [safeCoreScore, safeGrowthScore, safeBonusScore, animated, coreCount, growthCount, bonusCount]);

  return (
    <div className="relative flex items-center justify-center bg-zinc-900 rounded-2xl p-4" style={{ width: size + 32, height: size + 32 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background Rings */}
        <circle cx={center} cy={center} r={rCore} fill="none" strokeWidth={strokeWidth} className="stroke-emerald-950" />
        <circle cx={center} cy={center} r={rGrowth} fill="none" strokeWidth={strokeWidth} className="stroke-teal-950" />
        <circle cx={center} cy={center} r={rBonus} fill="none" strokeWidth={strokeWidth} className="stroke-amber-950" />

        {/* Foreground Rings */}
        <motion.circle
          cx={center}
          cy={center}
          r={rCore}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-emerald-500"
          strokeLinecap="round"
          strokeDasharray={cCore}
          initial={{ strokeDashoffset: animated ? cCore : oCore }}
          animate={{ strokeDashoffset: oCore }}
          transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={rGrowth}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-teal-400"
          strokeLinecap="round"
          strokeDasharray={cGrowth}
          initial={{ strokeDashoffset: animated ? cGrowth : oGrowth }}
          animate={{ strokeDashoffset: oGrowth }}
          transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={rBonus}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-amber-500"
          strokeLinecap="round"
          strokeDasharray={cBonus}
          initial={{ strokeDashoffset: animated ? cBonus : oBonus }}
          animate={{ strokeDashoffset: oBonus }}
          transition={{ duration: 1, type: 'spring', bounce: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center space-y-1">
          <div className="flex items-center text-emerald-500 text-sm font-bold">
            <span className="w-3 h-3 rounded-full bg-emerald-500 mr-1" />
            <motion.span>{roundedCore}</motion.span>%
          </div>
          <div className="flex items-center text-teal-400 text-sm font-bold">
            <span className="w-3 h-3 rounded-full bg-teal-400 mr-1" />
            <motion.span>{roundedGrowth}</motion.span>%
          </div>
          <div className="flex items-center text-amber-500 text-sm font-bold">
            <span className="w-3 h-3 rounded-full bg-amber-500 mr-1" />
            <motion.span>{roundedBonus}</motion.span>%
          </div>
        </div>
      </div>
    </div>
  );
}
