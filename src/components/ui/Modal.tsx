"use client";
import React, { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE } from '@/lib/motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="fixed inset-0 z-40 overlay-glass noise-overlay"
            onClick={onClose}
          />
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 text-foreground shadow-long"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-4">
              {title && <h2 className="text-xl font-bold text-foreground">{title}</h2>}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}