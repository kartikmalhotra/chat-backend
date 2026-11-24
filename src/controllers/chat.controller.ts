import type { RequestHandler } from 'express';

import type { ChatService } from '../services/chat.service.js';
import type { MessageService } from '../services/message.service.js';
import { sendOk } from '../utils/http.js';
import { parseOrThrow } from '../utils/validation.js';
import {
  addMembersSchema,
  chatMemberParamsSchema,
  chatParamsSchema,
  createChatSchema,
  createGroupChatSchema,
  deleteMessageSchema,
  editMessageSchema,
  lastSeenSchema,
  listMessagesQuerySchema,
  markReadSchema,
  messageParamsSchema,
  removeMemberSchema,
  sendMessageSchema,
} from '../validators/schemas.js';

export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
  ) {}

  createChat: RequestHandler = async (req, res) => {
    const { userAId, userBId } = parseOrThrow(createChatSchema, req.body, 'body');

    const { chat, created } = await this.chatService.createOrGetDirectChat(userAId, userBId);
    sendOk(res, { chatId: chat.chatId, created, chat }, created ? 201 : 200);
  };

  createGroupChat: RequestHandler = async (req, res) => {
    const body = parseOrThrow(createGroupChatSchema, req.body, 'body');

    const chat = await this.chatService.createGroupChat(body);
    sendOk(res, { chatId: chat.chatId, chat }, 201);
  };

  getChat: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    sendOk(res, { chat: await this.chatService.getChat(chatId) });
  };

  sendMessage: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    const { senderId, text } = parseOrThrow(sendMessageSchema, req.body, 'body');

    const message = await this.messageService.sendMessage(chatId, senderId, text);
    sendOk(res, { message }, 201);
  };

  getMessages: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    const { limit, before } = parseOrThrow(listMessagesQuerySchema, req.query, 'query');

    const page = await this.messageService.getMessages(chatId, {
      ...(limit !== undefined ? { limit } : {}),
      ...(before !== undefined ? { beforeMessageId: before } : {}),
    });

    sendOk(res, page);
  };

  markMessageRead: RequestHandler = async (req, res) => {
    const { chatId, messageId } = parseOrThrow(messageParamsSchema, req.params, 'params');
    const { userId } = parseOrThrow(markReadSchema, req.body, 'body');

    const message = await this.messageService.markMessageRead(chatId, messageId, userId);
    sendOk(res, { message });
  };

  updateLastSeen: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    const { userId, messageId } = parseOrThrow(lastSeenSchema, req.body, 'body');

    const lastSeen = await this.messageService.updateLastSeen(chatId, userId, messageId);
    sendOk(res, { lastSeen });
  };

  listLastSeen: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    sendOk(res, { lastSeen: await this.messageService.listLastSeen(chatId) });
  };

  editMessage: RequestHandler = async (req, res) => {
    const { chatId, messageId } = parseOrThrow(messageParamsSchema, req.params, 'params');
    const { userId, text } = parseOrThrow(editMessageSchema, req.body, 'body');

    const message = await this.messageService.editMessage(chatId, messageId, userId, text);
    sendOk(res, { message });
  };

  deleteMessage: RequestHandler = async (req, res) => {
    const { chatId, messageId } = parseOrThrow(messageParamsSchema, req.params, 'params');
    const { userId } = parseOrThrow(deleteMessageSchema, req.body, 'body');

    const message = await this.messageService.deleteMessage(chatId, messageId, userId);
    sendOk(res, { message });
  };

  addMembers: RequestHandler = async (req, res) => {
    const { chatId } = parseOrThrow(chatParamsSchema, req.params, 'params');
    const { actorId, userIds } = parseOrThrow(addMembersSchema, req.body, 'body');

    const chat = await this.chatService.addMembers(chatId, actorId, userIds);
    sendOk(res, { chat });
  };

  removeMember: RequestHandler = async (req, res) => {
    const { chatId, userId } = parseOrThrow(chatMemberParamsSchema, req.params, 'params');
    const { actorId } = parseOrThrow(removeMemberSchema, req.body, 'body');

    const chat = await this.chatService.removeMember(chatId, actorId, userId);
    sendOk(res, { chat });
  };
}
