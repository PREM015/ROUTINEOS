'use client';

import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

interface PermissionErrorProps {
  message?: string;
  requiredRole?: string;
}

export function PermissionError({ 
  message = "You don't have permission to access this resource.",
  requiredRole 
}: PermissionErrorProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center space-y-4">
      <ShieldAlert className="w-16 h-16 text-red-500" />
      <h2 className="text-2xl font-bold text-zinc-200">Access Denied</h2>
      <p className="text-zinc-400 max-w-md">
        {message}
      </p>
      {requiredRole && (
        <p className="text-sm text-zinc-500">
          Required role: <span className="font-mono text-yellow-500">{requiredRole}</span>
        </p>
      )}
      <div className="flex gap-3 mt-6">
        <Button onClick={() => router.back()} variant="outline">
          Go Back
        </Button>
        <Button onClick={() => router.push('/dashboard')}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}