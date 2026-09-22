/**
 * Standardized API Response Helpers
 */

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
}

export function successResponse<T>(data: T, meta?: APIResponse['meta']): APIResponse<T> {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

export function apiSuccess<T>(data: T, meta?: APIResponse['meta']): APIResponse<T> {
  return successResponse(data, meta);
}

export function errorResponse(error: string, details?: any): APIResponse {
  return {
    success: false,
    error,
    ...(details && { details }),
  };
}

export function validationErrorResponse(errors: any): APIResponse {
  return {
    success: false,
    error: 'Validation failed',
    details: errors,
  };
}

export function unauthorizedResponse(): APIResponse {
  return {
    success: false,
    error: 'Unauthorized',
  };
}

export function forbiddenResponse(): APIResponse {
  return {
    success: false,
    error: 'Forbidden',
  };
}

export function notFoundResponse(resource: string = 'Resource'): APIResponse {
  return {
    success: false,
    error: `${resource} not found`,
  };
}