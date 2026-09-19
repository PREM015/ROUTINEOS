import { X } from 'lucide-react';
import { useState } from 'react';

interface BannerProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function Banner({
  variant = 'info',
  children,
  dismissible = false,
  onDismiss,
}: BannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const variants = {
    info: 'bg-blue-50 text-blue-900 border-blue-200',
    success: 'bg-green-50 text-green-900 border-green-200',
    warning: 'bg-yellow-50 text-yellow-900 border-yellow-200',
    error: 'bg-red-50 text-red-900 border-red-200',
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className={`px-4 py-3 border-b ${variants[variant]}`}>
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex-1">{children}</div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="ml-4 p-1 hover:bg-black/5 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}