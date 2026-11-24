import { z } from 'zod';

import { env } from '../config/env.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const userIdSchema = z.string().regex(UUID_PATTERN, 'Must be a UUID');

export const messageIdSchema = z
  .string()
  .min(1, 'Must not be empty')
  .max(128, 'Must be at most 128 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'Must be a Firestore document id');

export const chatIdSchema = z.string().regex(UUID_PATTERN, 'Must be a UUID');

export const messageTextSchema = z
  .string()
  .trim()
  .min(1, 'Message text must not be empty')
  .max(4000, 'Message text must be at most 4000 characters');

export const chatParamsSchema = z.object({ chatId: chatIdSchema });

export const messageParamsSchema = z.object({
  chatId: chatIdSchema,
  messageId: messageIdSchema,
});

export const userParamsSchema = z.object({ userId: userIdSchema });

export const chatMemberParamsSchema = z.object({
  chatId: chatIdSchema,
  userId: userIdSchema,
});

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Must be at least 3 characters')
    .max(64, 'Must be at most 64 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'May contain letters, digits, dot, underscore and hyphen'),
  displayName: z.string().trim().min(1).max(128),
});

export const createChatSchema = z.object({
  userAId: userIdSchema,
  userBId: userIdSchema,
});

export const createGroupChatSchema = z.object({
  name: z.string().trim().min(1, 'Group name must not be empty').max(128),
  creatorId: userIdSchema,
  memberIds: z.array(userIdSchema).min(1, 'A group needs at least one other member').max(256),
});

export const sendMessageSchema = z.object({
  senderId: userIdSchema,
  text: messageTextSchema,
});

export const markReadSchema = z.object({
  userId: userIdSchema,
});

export const lastSeenSchema = z.object({
  userId: userIdSchema,
  messageId: messageIdSchema,
});

export const editMessageSchema = z.object({
  userId: userIdSchema,
  text: messageTextSchema,
});

export const deleteMessageSchema = z.object({
  userId: userIdSchema,
});

export const addMembersSchema = z.object({
  actorId: userIdSchema,
  userIds: z.array(userIdSchema).min(1).max(256),
});

export const removeMemberSchema = z.object({
  actorId: userIdSchema,
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int('Must be an integer')
    .min(1, 'Must be at least 1')
    .max(env.MESSAGE_PAGE_SIZE_MAX, `Must be at most ${env.MESSAGE_PAGE_SIZE_MAX}`)
    .optional(),
  before: messageIdSchema.optional(),
});

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type CreateChatBody = z.infer<typeof createChatSchema>;
export type CreateGroupChatBody = z.infer<typeof createGroupChatSchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
