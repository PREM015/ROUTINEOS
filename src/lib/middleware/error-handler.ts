import { NextResponse } from 'next/server';

type RouteHandler = (req: Request, ...args: any[]) => Promise<Response> | Response;

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req: Request, ...args: any[]) => {
    try {
      return await handler(req, ...args);
    } catch (error: any) {
      console.error('API Error:', error);
      return NextResponse.json(
        { error: error.message || 'Internal Server Error' },
        { status: error.status || 500 }
      );
    }
  };
}
