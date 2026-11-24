export type ErrorCode =
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: unknown;
  readonly expected = true;
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
    Error.captureStackTrace(this, AppError);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }

  static notFound(message: string, details?: unknown): AppError {
    return new AppError('NOT_FOUND', message, details);
  }

  static forbidden(message: string, details?: unknown): AppError {
    return new AppError('FORBIDDEN', message, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', message, details);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
