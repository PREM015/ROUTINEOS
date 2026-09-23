"use client";
import { motion, useReducedMotion } from 'framer-motion';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  const reduce = useReducedMotion();
  return (
    <label className="flex items-center cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <div
          className={`block w-10 h-6 rounded-full transition-colors duration-300 ease-out-expo ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}
        />
        <motion.div
          className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm"
          initial={false}
          animate={{ x: checked ? 16 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
      {label && <span className="ml-3 text-sm font-medium text-foreground">{label}</span>}
    </label>
  );
}