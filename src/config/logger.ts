import pino, { type Logger } from 'pino';

import { env, isProduction, isTest } from './env.js';

export const logger: Logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'chat-backend' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    remove: true,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});
