import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDirectChat,
  createTestContext,
  createUser,
  sendMessage,
  type TestContext,
} from '../helpers/test-app.js';

describe('messages', () => {
  let ctx: TestContext;
  let alice: string;
  let bob: string;
  let carol: string;
  let chatId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    alice = await createUser(ctx.app, 'alice');
    bob = await createUser(ctx.app, 'bob');
    carol = await createUser(ctx.app, 'carol');
    chatId = await createDirectChat(ctx.app, alice, bob);
  });

  describe('POST /chat/:chatId/message/send', () => {
    it('stores a message with a timestamp and an empty receipt list', async () => {
      const response = await request(ctx.app)
        .post(`/chat/${chatId}/message/send`)
        .send({ senderId: alice, text: 'hello' })
        .expect(201);

      const { message } = response.body.data;
      expect(message).toMatchObject({
        chatId,
        senderId: alice,
        text: 'hello',
        isDeleted: false,
        isEdited: false,
        readBy: [],
      });

      expect(Date.parse(message.createdAt)).not.toBeNaN();
    });

    it('rejects a sender who is not a member of the chat', async () => {
      const response = await request(ctx.app)
        .post(`/chat/${chatId}/message/send`)
        .send({ senderId: carol, text: 'let me in' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects empty text', async () => {
      await request(ctx.app)
        .post(`/chat/${chatId}/message/send`)
        .send({ senderId: alice, text: '' })
        .expect(400);
    });

    it('404s for an unknown chat', async () => {
      await request(ctx.app)
        .post('/chat/99999999-9999-4999-8999-999999999999/message/send')
        .send({ senderId: alice, text: 'hi' })
        .expect(404);
    });
  });

  describe('GET /chat/:chatId/messages', () => {
    it('returns messages oldest first', async () => {
      await sendMessage(ctx.app, chatId, alice, 'one');
      await sendMessage(ctx.app, chatId, bob, 'two');
      await sendMessage(ctx.app, chatId, alice, 'three');

      const response = await request(ctx.app).get(`/chat/${chatId}/messages`).expect(200);
      expect(response.body.data.messages.map((m: { text: string }) => m.text)).toEqual([
        'one',
        'two',
        'three',
      ]);
    });

    it('honours limit and returns the newest window with a cursor', async () => {
      for (const text of ['one', 'two', 'three', 'four', 'five']) {
        await sendMessage(ctx.app, chatId, alice, text);
      }

      const page = await request(ctx.app).get(`/chat/${chatId}/messages?limit=2`).expect(200);
      expect(page.body.data.messages.map((m: { text: string }) => m.text)).toEqual([
        'four',
        'five',
      ]);

      expect(page.body.data.pageInfo).toMatchObject({ limit: 2, count: 2, hasMore: true });

      const older = await request(ctx.app)
        .get(`/chat/${chatId}/messages?limit=2&before=${page.body.data.pageInfo.nextBefore}`)
        .expect(200);

      expect(older.body.data.messages.map((m: { text: string }) => m.text)).toEqual([
        'two',
        'three',
      ]);
    });

    it('reports hasMore false on the last page', async () => {
      await sendMessage(ctx.app, chatId, alice, 'only');

      const response = await request(ctx.app).get(`/chat/${chatId}/messages?limit=50`).expect(200);
      expect(response.body.data.pageInfo).toMatchObject({ hasMore: false, nextBefore: null });
    });

    it('rejects a limit above the maximum', async () => {
      await request(ctx.app).get(`/chat/${chatId}/messages?limit=500`).expect(400);
    });
  });

  describe('POST /chat/:chatId/message/:messageId/read', () => {
    it('records a read receipt', async () => {
      const messageId = await sendMessage(ctx.app, chatId, alice, 'hello');

      const response = await request(ctx.app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .send({ userId: bob })
        .expect(200);

      expect(response.body.data.message.readBy).toEqual([
        { userId: bob, readAt: expect.any(String) },
      ]);
    });

    it('is idempotent and keeps the first read time', async () => {
      const messageId = await sendMessage(ctx.app, chatId, alice, 'hello');

      const first = await request(ctx.app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .send({ userId: bob })
        .expect(200);

      const second = await request(ctx.app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .send({ userId: bob })
        .expect(200);

      expect(second.body.data.message.readBy).toEqual(first.body.data.message.readBy);
    });

    it('rejects a non-member', async () => {
      const messageId = await sendMessage(ctx.app, chatId, alice, 'hello');

      await request(ctx.app)
        .post(`/chat/${chatId}/message/${messageId}/read`)
        .send({ userId: carol })
        .expect(403);
    });

    it('404s for an unknown message', async () => {
      await request(ctx.app)
        .post(`/chat/${chatId}/message/does-not-exist/read`)
        .send({ userId: bob })
        .expect(404);
    });
  });

  describe('POST /chat/:chatId/lastseen', () => {
    it('stores the last seen message per user', async () => {
      const first = await sendMessage(ctx.app, chatId, alice, 'one');
      await sendMessage(ctx.app, chatId, alice, 'two');

      const response = await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId: first })
        .expect(200);

      expect(response.body.data.lastSeen).toMatchObject({ userId: bob, chatId, messageId: first });
    });

    it('drives the unread count', async () => {
      const first = await sendMessage(ctx.app, chatId, alice, 'one');
      await sendMessage(ctx.app, chatId, alice, 'two');

      await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId: first })
        .expect(200);

      const chats = await request(ctx.app).get(`/user/${bob}/chats`).expect(200);
      expect(chats.body.data.chats[0].unreadCount).toBe(1);
      expect(chats.body.data.chats[0].lastSeenMessageId).toBe(first);
    });

    it('never moves the pointer backwards', async () => {
      const first = await sendMessage(ctx.app, chatId, alice, 'one');
      const second = await sendMessage(ctx.app, chatId, alice, 'two');

      await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId: second })
        .expect(200);

      const response = await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId: first })
        .expect(200);

      expect(response.body.data.lastSeen.messageId).toBe(second);
    });

    it('exposes every member pointer via GET /chat/:chatId/lastseen', async () => {
      const messageId = await sendMessage(ctx.app, chatId, alice, 'one');

      await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId })
        .expect(200);

      const response = await request(ctx.app).get(`/chat/${chatId}/lastseen`).expect(200);
      expect(response.body.data.lastSeen).toHaveLength(1);
    });

    it('404s when the message is not in the chat', async () => {
      await request(ctx.app)
        .post(`/chat/${chatId}/lastseen`)
        .send({ userId: bob, messageId: 'nope' })
        .expect(404);
    });
  });
});
