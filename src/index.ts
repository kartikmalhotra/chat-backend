import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { getFirestoreClient } from './config/firebase.js';
import { logger } from './config/logger.js';
import { disconnectPrisma, getPrismaClient } from './config/prisma.js';
import { FirestoreMessageRepository } from './repositories/firestore/message.repository.js';
import { PostgresChatRepository } from './repositories/postgres/chat.repository.js';
import { PostgresUserRepository } from './repositories/postgres/user.repository.js';

function buildServer(): Server {
  const prisma = getPrismaClient();
  const firestore = getFirestoreClient();

  const app = createApp({
    userRepository: new PostgresUserRepository(prisma),
    chatRepository: new PostgresChatRepository(prisma),
    messageRepository: new FirestoreMessageRepository(firestore),
  });

  return app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, project: env.FIREBASE_PROJECT_ID },
      'chat-backend listening',
    );
  });
}

function registerShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    server.close(() => {
      void disconnectPrisma()
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Failed to close PostgreSQL pool');
        })
        .finally(() => {
          process.exit(0);
        });
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}

try {
  registerShutdownHandlers(buildServer());
} catch (error: unknown) {
  logger.fatal({ err: error }, 'Failed to start chat-backend');
  process.exit(1);
}
