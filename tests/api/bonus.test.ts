import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDirectChat,
  createTestContext,
  createUser,
  sendMessage,
  type TestContext,
} from '../helpers/test-app.js';

describe('bonus: group chats', () => {
  let ctx: TestContext;
  let alice: string;
  let bob: string;
  let carol: string;
  let dave: string;
  beforeEach(async () => {
    ctx = createTestContext();
    alice = await createUser(ctx.app, 'alice');
    bob = await createUser(ctx.app, 'bob');
    carol = await createUser(ctx.app, 'carol');
    dave = await createUser(ctx.app, 'dave');
  });

  async function createGroup(): Promise<string> {
    const response = await request(ctx.app)
      .post('/chat/group/create')
      .send({ name: 'Weekend plans', creatorId: alice, memberIds: [bob, carol] })
      .expect(201);

    return response.body.data.chatId as string;
  }

  it('creates a group with the creator as owner', async () => {
    const response = await request(ctx.app)
      .post('/chat/group/create')
      .send({ name: 'Weekend plans', creatorId: alice, memberIds: [bob, carol] })
      .expect(201);

    const { chat } = response.body.data;
    expect(chat.type).toBe('GROUP');
    expect(chat.name).toBe('Weekend plans');
    expect(chat.memberIds).toHaveLength(3);
    expect(chat.members.find((m: { userId: string }) => m.userId === alice).role).toBe('OWNER');
  });

  it('lets the owner add a member', async () => {
    const chatId = await createGroup();

    const response = await request(ctx.app)
      .post(`/chat/${chatId}/members`)
      .send({ actorId: alice, userIds: [dave] })
      .expect(200);

    expect(response.body.data.chat.memberIds).toContain(dave);
  });

  it('rejects a plain member adding people', async () => {
    const chatId = await createGroup();

    await request(ctx.app)
      .post(`/chat/${chatId}/members`)
      .send({ actorId: bob, userIds: [dave] })
      .expect(403);
  });

  it('lets a member leave, but protects the owner from removal', async () => {
    const chatId = await createGroup();

    const left = await request(ctx.app)
      .delete(`/chat/${chatId}/members/${bob}`)
      .send({ actorId: bob })
      .expect(200);

    expect(left.body.data.chat.memberIds).not.toContain(bob);

    await request(ctx.app)
      .delete(`/chat/${chatId}/members/${alice}`)
      .send({ actorId: carol })
      .expect(403);
  });

  it('refuses membership changes on a 1:1 chat', async () => {
    const chatId = await createDirectChat(ctx.app, alice, bob);

    await request(ctx.app)
      .post(`/chat/${chatId}/members`)
      .send({ actorId: alice, userIds: [carol] })
      .expect(400);
  });

  it('carries group messages like any other chat', async () => {
    const chatId = await createGroup();
    await sendMessage(ctx.app, chatId, carol, 'Trek on Saturday?');

    const response = await request(ctx.app).get(`/chat/${chatId}/messages`).expect(200);
    expect(response.body.data.messages).toHaveLength(1);
  });
});

describe('bonus: message edit and delete', () => {
  let ctx: TestContext;
  let alice: string;
  let bob: string;
  let chatId: string;
  let messageId: string;
  beforeEach(async () => {
    ctx = createTestContext();
    alice = await createUser(ctx.app, 'alice');
    bob = await createUser(ctx.app, 'bob');
    chatId = await createDirectChat(ctx.app, alice, bob);
    messageId = await sendMessage(ctx.app, chatId, alice, 'orignal typo');
  });

  it('lets the author edit the text and flags it as edited', async () => {
    const response = await request(ctx.app)
      .patch(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice, text: 'original, fixed' })
      .expect(200);

    expect(response.body.data.message).toMatchObject({
      text: 'original, fixed',
      isEdited: true,
    });

    expect(response.body.data.message.editedAt).toEqual(expect.any(String));
  });

  it('refuses an edit from anyone else', async () => {
    await request(ctx.app)
      .patch(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: bob, text: 'not mine' })
      .expect(403);
  });

  it('soft deletes: the message stays, the text is dropped', async () => {
    const response = await request(ctx.app)
      .delete(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice })
      .expect(200);

    expect(response.body.data.message).toMatchObject({ text: null, isDeleted: true });

    const messages = await request(ctx.app).get(`/chat/${chatId}/messages`).expect(200);
    expect(messages.body.data.messages).toHaveLength(1);
    expect(messages.body.data.messages[0].isDeleted).toBe(true);
  });

  it('refuses to edit a deleted message', async () => {
    await request(ctx.app)
      .delete(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice })
      .expect(200);

    await request(ctx.app)
      .patch(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice, text: 'back from the dead' })
      .expect(400);
  });

  it('treats a repeated delete as a no-op', async () => {
    await request(ctx.app)
      .delete(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice })
      .expect(200);

    await request(ctx.app)
      .delete(`/chat/${chatId}/message/${messageId}`)
      .send({ userId: alice })
      .expect(200);
  });
});

describe('users', () => {
  it('rejects a duplicate username with 409', async () => {
    const ctx = createTestContext();
    await createUser(ctx.app, 'alice');

    const response = await request(ctx.app)
      .post('/user')
      .send({ username: 'alice', displayName: 'Impostor' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('lists users newest first', async () => {
    const ctx = createTestContext();
    await createUser(ctx.app, 'alice');
    await createUser(ctx.app, 'bob');

    const response = await request(ctx.app).get('/users').expect(200);
    expect(response.body.data.users).toHaveLength(2);
  });
});
