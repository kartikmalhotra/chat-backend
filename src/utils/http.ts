import type { Response } from 'express';

export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
}

export interface ErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export function sendOk<T>(res: Response, data: T, status = 200): void {
  const body: SuccessEnvelope<T> = { success: true, data };
  res.status(status).json(body);
}
