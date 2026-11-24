import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../config/logger.js';
import { AppError, isAppError } from '../utils/errors.js';
import type { ErrorEnvelope } from '../utils/http.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};

function isBodyParserError(error: unknown): error is SyntaxError & { status: number } {
  return error instanceof SyntaxError && 'status' in error && 'body' in error;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (isBodyParserError(error)) {
    appError = AppError.validation('Request body is not valid JSON');
  } else {
    appError = AppError.internal('An unexpected error occurred');
    logger.error(
      { err: error, method: req.method, url: req.originalUrl },
      'Unhandled error while serving request',
    );
  }

  if (appError.statusCode < 500) {
    logger.debug(
      { code: appError.code, method: req.method, url: req.originalUrl },
      appError.message,
    );
  }

  const body: ErrorEnvelope = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  };

  res.status(appError.statusCode).json(body);
};
