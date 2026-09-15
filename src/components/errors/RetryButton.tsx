'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RefreshCw } from 'lucide-react';

interface RetryButtonProps {
  onRetry: () => void | Promise<void>;
  label?: string;
  loadingLabel?: string;
}

export function RetryButton({ 
  onRetry, 
  label = 'Try Again',
  loadingLabel = 'Retrying...'
}: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Button
      onClick={handleRetry}
      disabled={isRetrying}
      variant="outline"
      className="gap-2"
    >
      <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
      {isRetrying ? loadingLabel : label}
    </Button>
  );
}