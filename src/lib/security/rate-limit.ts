import { NextRequest } from 'next/server';

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const store = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let record = store.get(key);
  if (!record || record.resetTime < now) {
    record = { count: 1, resetTime: now + windowMs };
    store.set(key, record);
    return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: record.resetTime };
  }
  
  if (record.count >= maxRequests) {
    return { success: false, limit: maxRequests, remaining: 0, reset: record.resetTime };
  }
  
  record.count += 1;
  store.set(key, record);
  return { success: true, limit: maxRequests, remaining: maxRequests - record.count, reset: record.resetTime };
}

export function rateLimitMiddleware(key: string) {
  return (req: NextRequest): RateLimitResult => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    return rateLimit(key + '_' + ip, 100, 60000);
  };
}
