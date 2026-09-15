export class AppError extends Error {
  constructor(public message: string, public statusCode: number, public code: string, public details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
export class AuthError extends AppError { constructor(message = 'Unauthorized') { super(message, 401, 'UNAUTHORIZED'); } }
export class NotFoundError extends AppError { constructor(message = 'Not Found') { super(message, 404, 'NOT_FOUND'); } }
export class ForbiddenError extends AppError { constructor(message = 'Forbidden') { super(message, 403, 'FORBIDDEN'); } }
export class ValidationError extends AppError { constructor(message = 'Validation Error', details?: unknown) { super(message, 400, 'VALIDATION_ERROR', details); } }
export class ConflictError extends AppError { constructor(message = 'Conflict') { super(message, 409, 'CONFLICT'); } }
