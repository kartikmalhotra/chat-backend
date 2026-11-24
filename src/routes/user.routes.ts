import { Router } from 'express';

import type { UserController } from '../controllers/user.controller.js';

export function createUserRouter(controller: UserController): Router {
  const router = Router();

  router.post('/', controller.createUser);
  router.get('/:userId', controller.getUser);
  router.get('/:userId/chats', controller.listUserChats);

  return router;
}

export function createUsersRouter(controller: UserController): Router {
  const router = Router();

  router.get('/', controller.listUsers);

  return router;
}
