import { describe, expect, it } from 'vitest';

import {
  errorResponse,
  forbiddenResponse,
  notFoundResponse,
  successResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../../src/lib/api-response';

describe('api-response helpers', () => {
  it('successResponse wraps data with success, optionally adding meta', () => {
    expect(successResponse('ok')).toEqual({ success: true, data: 'ok' });
    expect(successResponse([1, 2], { total: 2, hasMore: false })).toEqual({
      success: true,
      data: [1, 2],
      meta: { total: 2, hasMore: false },
    });
  });

  it('errorResponse carries a message and optional details', () => {
    expect(errorResponse('boom')).toEqual({ success: false, error: 'boom' });
    expect(errorResponse('boom', { code: 'X' })).toEqual({
      success: false,
      error: 'boom',
      details: { code: 'X' },
    });
  });

  it('validationErrorResponse flags success as false and records field errors', () => {
    const details = { email: 'Invalid email' };
    const result = validationErrorResponse(details);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Validation failed');
    expect(result.details).toEqual(details);
  });

  it('unauthorizedResponse and forbiddenResponse use the standard messages', () => {
    const unauthorized = unauthorizedResponse();
    expect(unauthorized.success).toBe(false);
    expect(unauthorized.error).toBe('Unauthorized');

    const forbidden = forbiddenResponse();
    expect(forbidden.success).toBe(false);
    expect(forbidden.error).toBe('Forbidden');
  });

  it('notFoundResponse defaults the resource name and allows an override', () => {
    expect(notFoundResponse().error).toBe('Resource not found');
    expect(notFoundResponse('Habit').error).toBe('Habit not found');
  });
});