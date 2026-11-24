import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { ChatController } from './controllers/chat.controller.js';
import { UserController } from './controllers/user.controller.js';
import type {
  ChatRepository,
  MessageRepository,
  UserRepository,
} from './repositories/interfaces.js';
import { createApiRouter } from './routes/index.js';
import { ChatService } from './services/chat.service.js';
import { MessageService, type PageSizeConfig } from './services/message.service.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

export interface AppDependencies {
  readonly userRepository: UserRepository;
  readonly chatRepository: ChatRepository;
  readonly messageRepository: MessageRepository;
  readonly pageSize?: PageSizeConfig;
}

export function createApp(deps: AppDependencies): Express {
  const pageSize: PageSizeConfig = deps.pageSize ?? {
    defaultLimit: env.MESSAGE_PAGE_SIZE_DEFAULT,
    maxLimit: env.MESSAGE_PAGE_SIZE_MAX,
  };

  const chatService = new ChatService(
    deps.userRepository,
    deps.chatRepository,
    deps.messageRepository,
  );
  const messageService = new MessageService(
    chatService,
    deps.chatRepository,
    deps.messageRepository,
    pageSize,
  );

  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '128kb' }));

  if (!isTest) {
    app.use(pinoHttp({ logger }));
  }

  app.use(
    createApiRouter({
      chatController: new ChatController(chatService, messageService),
      userController: new UserController(chatService),
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
