import { Router } from 'express';

import type { ChatController } from '../controllers/chat.controller.js';

export function createChatRouter(controller: ChatController): Router {
  const router = Router();

  router.post('/create', controller.createChat);
  router.post('/group/create', controller.createGroupChat);

  router.get('/:chatId', controller.getChat);

  router.post('/:chatId/message/send', controller.sendMessage);
  router.get('/:chatId/messages', controller.getMessages);
  router.post('/:chatId/message/:messageId/read', controller.markMessageRead);

  router.post('/:chatId/lastseen', controller.updateLastSeen);
  router.get('/:chatId/lastseen', controller.listLastSeen);

  router.patch('/:chatId/message/:messageId', controller.editMessage);
  router.delete('/:chatId/message/:messageId', controller.deleteMessage);

  router.post('/:chatId/members', controller.addMembers);
  router.delete('/:chatId/members/:userId', controller.removeMember);

  return router;
}
