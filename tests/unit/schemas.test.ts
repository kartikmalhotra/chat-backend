import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/utils/errors.js';
import { parseOrThrow } from '../../src/utils/validation.js';
import {
  createChatSchema,
  listMessagesQuerySchema,
  sendMessageSchema,
} from '../../src/validators/schemas.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
describe('request validation', () => {
  it('accepts a well-formed send-message body', () => {
    const parsed = parseOrThrow(sendMessageSchema, { senderId: USER_ID, text: '  hi  ' }, 'body');
    expect(parsed).toEqual({ senderId: USER_ID, text: 'hi' });
  });

  it('rejects empty or whitespace-only message text', () => {
    expect(() =>
      parseOrThrow(sendMessageSchema, { senderId: USER_ID, text: '   ' }, 'body'),
    ).toThrow(AppError);
  });

  it('reports the offending field in the error details', () => {
    try {
      parseOrThrow(createChatSchema, { userAId: USER_ID, userBId: 'nope' }, 'body');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).details).toEqual([
        { field: 'userBId', message: 'Must be a UUID' },
      ]);
    }
  });

  it('coerces the limit query parameter to a number', () => {
    expect(parseOrThrow(listMessagesQuerySchema, { limit: '25' }, 'query')).toEqual({ limit: 25 });
  });

  it('rejects a limit above the configured maximum', () => {
    expect(() => parseOrThrow(listMessagesQuerySchema, { limit: '5000' }, 'query')).toThrow(
      AppError,
    );
  });
});
