import { Router } from 'express';

import type { ChatController } from '../controllers/chat.controller.js';
import type { UserController } from '../controllers/user.controller.js';
import { sendOk } from '../utils/http.js';
import { createChatRouter } from './chat.routes.js';
import { createUserRouter, createUsersRouter } from './user.routes.js';

export interface Controllers {
  readonly chatController: ChatController;
  readonly userController: UserController;
}

export function createApiRouter({ chatController, userController }: Controllers): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    sendOk(res, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  router.use('/chat', createChatRouter(chatController));
  router.use('/user', createUserRouter(userController));
  router.use('/users', createUsersRouter(userController));

  return router;
}
