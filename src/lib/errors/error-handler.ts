import { NextResponse } from 'next/server';
import { AppError } from './app-error';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/**
 * Global Error Handler
 */

export function handleApiError(error: unknown): NextResponse {
  return handleError(error);
}

export function handleError(error: unknown): NextResponse {
  console.error('Error occurred:', error);

  // App errors
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.flatten(),
      },
      { status: 400 }
    );
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error);
  }

  // Generic errors
  if (error instanceof Error) {
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : error.message,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }

  // Unknown errors
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  );
}

function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): NextResponse {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      return NextResponse.json(
        {
          error: 'A record with this value already exists',
          code: 'DUPLICATE_RECORD',
          details: error.meta,
        },
        { status: 409 }
      );

    case 'P2025':
      // Record not found
      return NextResponse.json(
        {
          error: 'Record not found',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );

    case 'P2003':
      // Foreign key constraint violation
      return NextResponse.json(
        {
          error: 'Related record not found',
          code: 'FOREIGN_KEY_ERROR',
          details: error.meta,
        },
        { status: 400 }
      );

    default:
      return NextResponse.json(
        {
          error: 'Database operation failed',
          code: 'DATABASE_ERROR',
        },
        { status: 500 }
      );
  }
}

/**
 * Error logger for monitoring
 */
export function logError(error: unknown, context?: Record<string, any>) {
  // In production, send to monitoring service (Sentry, DataDog, etc.)
  console.error('ERROR:', {
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error,
    context,
  });
}