import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from './app-error';
import { ERROR_CODES } from './error-codes';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';

export function handleApiError(error: unknown, req?: Request, userId?: string): NextResponse {
  // Report error to monitoring service
  if (error instanceof Error) {
    if (req) {
      ErrorReporter.reportApiError(error, req, userId);
    } else {
      ErrorReporter.report(error, { userId });
    }
  }

  // Handle known error types
  if (error instanceof AppError) {
    return NextResponse.json(
      { 
        success: false,
        error: error.message, 
        code: error.code, 
        details: error.details 
      }, 
      { status: error.statusCode }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      { 
        success: false,
        error: 'Validation failed', 
        code: ERROR_CODES.VALIDATION_ERROR, 
        details: formatZodError(error) 
      }, 
      { status: 400 }
    );
  }

  // Log unknown errors
  console.error('Unhandled error:', error);

  // Generic error response
  return NextResponse.json(
    { 
      success: false,
      error: 'Internal Server Error', 
      code: ERROR_CODES.SERVER_ERROR 
    }, 
    { status: 500 }
  );
}

export function formatZodError(error: ZodError): string[] {
  return error.issues.map((err: ZodError['issues'][number]) => `${err.path.join('.')}: ${err.message}`);
}