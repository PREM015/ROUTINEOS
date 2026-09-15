"use client";
import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message = 'An unexpected error occurred.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <AlertCircle className="w-12 h-12 text-red-500" />
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-gray-500">{message}</p>
      {onRetry && <Button onClick={onRetry} variant="outline">Retry</Button>}
    </div>
  );
}
