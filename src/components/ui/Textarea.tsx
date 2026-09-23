"use client";
import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>}
        <textarea
          className={`block w-full rounded-lg border border-border bg-card shadow-sm transition-[border-color,box-shadow] duration-200 ease-out-expo placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/25 sm:text-sm px-3 py-2 text-foreground disabled:opacity-60 disabled:cursor-not-allowed ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/25' : ''} ${className}`}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';