"use client";
import React from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <WifiOff className="w-12 h-12 text-orange-500" />
      <h3 className="text-xl font-bold">Network Error</h3>
      <p className="text-gray-500">Please check your internet connection.</p>
      {onRetry && <Button onClick={onRetry} variant="outline">Retry</Button>}
    </div>
  );
}
