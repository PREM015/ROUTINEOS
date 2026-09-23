"use client";
import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE } from '@/lib/motion';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  /** Lifetime in ms; must stay in sync with the `.toast-progress` keyframes. */
  duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const typeClasses = {
    success: 'toast-success',
    error: 'toast-error',
    info: 'toast-info',
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 48, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.35, ease: EASE }}
      role="status"
      aria-live="polite"
      className={`relative flex items-center overflow-hidden rounded-xl px-4 py-3 backdrop-blur-md ${typeClasses[type]}`}
    >
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        className="ml-4 rounded-md p-1 transition-colors hover:bg-white/20 hover:opacity-100 opacity-80 active:scale-90"
      >
        <X className="w-4 h-4" />
      </button>
      <span
        className="toast-progress absolute inset-x-0 bottom-0 h-0.5 bg-white/40"
        aria-hidden="true"
      />
    </motion.div>
  );
}