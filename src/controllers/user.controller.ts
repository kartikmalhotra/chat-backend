import type { RequestHandler } from 'express';

import type { ChatService } from '../services/chat.service.js';
import { sendOk } from '../utils/http.js';
import { parseOrThrow } from '../utils/validation.js';
import { createUserSchema, listUsersQuerySchema, userParamsSchema } from '../validators/schemas.js';

const DEFAULT_USER_LIST_LIMIT = 50;

export class UserController {
  constructor(private readonly chatService: ChatService) {}

  createUser: RequestHandler = async (req, res) => {
    const { username, displayName } = parseOrThrow(createUserSchema, req.body, 'body');

    const user = await this.chatService.createUser(username, displayName);
    sendOk(res, { user }, 201);
  };

  getUser: RequestHandler = async (req, res) => {
    const { userId } = parseOrThrow(userParamsSchema, req.params, 'params');
    sendOk(res, { user: await this.chatService.getUser(userId) });
  };

  listUsers: RequestHandler = async (req, res) => {
    const { limit } = parseOrThrow(listUsersQuerySchema, req.query, 'query');

    const users = await this.chatService.listUsers(limit ?? DEFAULT_USER_LIST_LIMIT);
    sendOk(res, { users });
  };

  listUserChats: RequestHandler = async (req, res) => {
    const { userId } = parseOrThrow(userParamsSchema, req.params, 'params');

    const chats = await this.chatService.listUserChats(userId);
    sendOk(res, { chats });
  };
}
