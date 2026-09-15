'use client';

import { useCallback } from 'react';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';
import { useSession } from 'next-auth/react';

interface ErrorHandlerOptions {
  showNotification?: boolean;
  logToConsole?: boolean;
  reportToService?: boolean;
}

/**
 * Client-side error handling hook
 */
export function useErrorHandler() {
  const { data: session } = useSession();

  const handleError = useCallback((
    error: Error,
    options: ErrorHandlerOptions = {}
  ) => {
    const {
      showNotification = true,
      logToConsole = true,
      reportToService = true,
    } = options;

    // Log to console in development
    if (logToConsole && process.env.NODE_ENV === 'development') {
      console.error('Error:', error);
    }

    // Report to monitoring service
    if (reportToService) {
      ErrorReporter.reportClientError(error, session?.user?.id);
    }

    // Show user-friendly notification
    if (showNotification && typeof window !== 'undefined') {
      // TODO: Integrate with your toast/notification system
      console.warn('Notification:', error.message);
    }

    return error;
  }, [session?.user?.id]);

  return { handleError };
}