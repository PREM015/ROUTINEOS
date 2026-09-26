"use client";
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps) {
  const reduce = useReducedMotion();
  return (
    <label
      className={cn(
        'flex items-center select-none',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <div className="relative shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
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
      {(label || description) && (
        <span className="ml-3 min-w-0">
          {label && <span className="block text-sm font-medium text-foreground">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}