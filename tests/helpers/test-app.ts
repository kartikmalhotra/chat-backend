import type { Express } from 'express';
import request from 'supertest';

import { createApp } from '../../src/app.js';
import { createInMemoryStack, type InMemoryStack } from './in-memory-repositories.js';

export interface TestContext {
  readonly app: Express;
  readonly stack: InMemoryStack;
}

export function createTestContext(): TestContext {
  const stack = createInMemoryStack();

  const app = createApp({
    userRepository: stack.userRepository,
    chatRepository: stack.chatRepository,
    messageRepository: stack.messageRepository,
    pageSize: { defaultLimit: 50, maxLimit: 100 },
  });

  return { app, stack };
}

export async function createUser(app: Express, username: string): Promise<string> {
  const response = await request(app)
    .post('/user')
    .send({ username, displayName: username.toUpperCase() })
    .expect(201);

  return response.body.data.user.userId as string;
}

export async function createDirectChat(
  app: Express,
  userAId: string,
  userBId: string,
): Promise<string> {
  const response = await request(app).post('/chat/create').send({ userAId, userBId });

  return response.body.data.chatId as string;
}

export async function sendMessage(
  app: Express,
  chatId: string,
  senderId: string,
  text: string,
): Promise<string> {
  const response = await request(app)
    .post(`/chat/${chatId}/message/send`)
    .send({ senderId, text })
    .expect(201);

  return response.body.data.message.messageId as string;
}
