interface ErrorContext {
  userId?: string;
  userEmail?: string;
  route?: string;
  timestamp?: Date;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Centralized error reporting service
 * TODO: Integrate with Sentry, LogRocket, or similar in production
 */
export class ErrorReporter {
  /**
   * Report error to monitoring service
   */
  static report(error: Error, context?: ErrorContext): void {
    const errorData = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Console logging (development)
    if (process.env.NODE_ENV === 'development') {
      console.error('🔴 Error Report:', errorData);
    }

    // TODO: Send to external service in production
    // Example: Sentry.captureException(error, { contexts: { custom: context } });
    
    // Store in database audit log if critical
    if (this.isCritical(error)) {
      this.logToDatabase(errorData);
    }
  }

  /**
   * Report API error with request context
   */
  static reportApiError(error: Error, req: Request, userId?: string): void {
    this.report(error, {
      userId,
      route: new URL(req.url).pathname,
      userAgent: req.headers.get('user-agent') || undefined,
      timestamp: new Date(),
    });
  }

  /**
   * Report client-side error
   */
  static reportClientError(error: Error, userId?: string, metadata?: Record<string, any>): void {
    this.report(error, {
      userId,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      metadata,
    });
  }

  /**
   * Check if error is critical (requires immediate attention)
   */
  private static isCritical(error: Error): boolean {
    const criticalPatterns = [
      'database',
      'prisma',
      'ECONNREFUSED',
      'auth',
      'payment',
      'billing',
    ];

    return criticalPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern)
    );
  }

  /**
   * Log critical errors to database
   */
  private static async logToDatabase(errorData: any): Promise<void> {
    try {
      // TODO: Implement database logging
      // await prisma.errorLog.create({ data: errorData });
      console.error('💾 Critical error logged:', errorData.message);
    } catch (logError) {
      // Don't throw - logging errors shouldn't crash the app
      console.error('Failed to log error to database:', logError);
    }
  }
}