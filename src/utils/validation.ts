import type { ZodType } from 'zod';

import { AppError } from './errors.js';

export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

export function parseOrThrow<T>(schema: ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.') || label,
      message: issue.message,
    }));
    throw AppError.validation(`Invalid request ${label}`, issues);
  }

  return result.data;
}
