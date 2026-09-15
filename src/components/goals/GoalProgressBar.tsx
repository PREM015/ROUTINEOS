'use client';
import { motion } from 'framer-motion';

interface Props {
  percentage: number;
  current: number;
  target: number;
  unit?: string;
}

export default function GoalProgressBar({ percentage, current, target, unit }: Props) {
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1 text-gray-700 dark:text-gray-300">
        <span>{percentage.toFixed(0)}%</span>
        <span>{current} / {target} {unit}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-blue-600 h-2.5 rounded-full"
        />
      </div>
    </div>
  );
}
