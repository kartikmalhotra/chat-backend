import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDirectChat,
  createTestContext,
  createUser,
  sendMessage,
  type TestContext,
} from '../helpers/test-app.js';

const MISSING_USER_ID = '99999999-9999-4999-8999-999999999999';
describe('chats', () => {
  let ctx: TestContext;
  let alice: string;
  let bob: string;
  beforeEach(async () => {
    ctx = createTestContext();
    alice = await createUser(ctx.app, 'alice');
    bob = await createUser(ctx.app, 'bob');
  });

  describe('POST /chat/create', () => {
    it('creates a 1:1 chat with both members', async () => {
      const response = await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: alice, userBId: bob })
        .expect(201);

      expect(response.body.data.created).toBe(true);
      expect(response.body.data.chat.type).toBe('DIRECT');
      expect(response.body.data.chat.memberIds).toEqual(expect.arrayContaining([alice, bob]));
      expect(response.body.data.chatId).toEqual(expect.any(String));
    });

    it('returns the same chat for the same pair, in either order', async () => {
      const first = await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: alice, userBId: bob })
        .expect(201);

      const second = await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: bob, userBId: alice })
        .expect(200);

      expect(second.body.data.chatId).toBe(first.body.data.chatId);
      expect(second.body.data.created).toBe(false);
    });

    it('rejects a chat between a user and themselves', async () => {
      const response = await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: alice, userBId: alice })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('404s when one of the users does not exist', async () => {
      const response = await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: alice, userBId: MISSING_USER_ID })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('400s on a malformed user id', async () => {
      await request(ctx.app)
        .post('/chat/create')
        .send({ userAId: alice, userBId: 'x' })
        .expect(400);
    });
  });

  describe('GET /user/:userId/chats', () => {
    it('lists the chats of a user with their member ids', async () => {
      const chatId = await createDirectChat(ctx.app, alice, bob);

      const response = await request(ctx.app).get(`/user/${alice}/chats`).expect(200);
      expect(response.body.data.chats).toHaveLength(1);
      expect(response.body.data.chats[0].chatId).toBe(chatId);
      expect(response.body.data.chats[0].memberIds).toEqual(expect.arrayContaining([alice, bob]));
    });

    it('includes the last message and the unread count', async () => {
      const chatId = await createDirectChat(ctx.app, alice, bob);
      await sendMessage(ctx.app, chatId, bob, 'first');
      await sendMessage(ctx.app, chatId, bob, 'second');

      const response = await request(ctx.app).get(`/user/${alice}/chats`).expect(200);
      const [chat] = response.body.data.chats;
      expect(chat.lastMessage.text).toBe('second');
      expect(chat.unreadCount).toBe(2);
      expect(chat.lastSeenMessageId).toBeNull();
    });

    it('does not leak chats the user is not a member of', async () => {
      const carol = await createUser(ctx.app, 'carol');
      await createDirectChat(ctx.app, alice, bob);

      const response = await request(ctx.app).get(`/user/${carol}/chats`).expect(200);
      expect(response.body.data.chats).toEqual([]);
    });

    it('404s for an unknown user', async () => {
      await request(ctx.app).get(`/user/${MISSING_USER_ID}/chats`).expect(404);
    });
  });

  it('404s unknown routes with the error envelope', async () => {
    const response = await request(ctx.app).get('/nope').expect(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /nope does not exist' },
    });
  });

  it('serves a health check', async () => {
    const response = await request(ctx.app).get('/health').expect(200);
    expect(response.body.data.status).toBe('ok');
  });
});
