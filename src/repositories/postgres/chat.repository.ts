import type { PrismaClient } from '../../generated/prisma/client.js';
import type { ChatRecord } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import type {
  AddMembersInput,
  ChatRepository,
  CreateDirectChatInput,
  CreateGroupChatInput,
} from '../interfaces.js';
import { toChatRecord } from './mappers.js';
import { isUniqueViolation } from './prisma-errors.js';

const chatInclude = {
  members: {
    include: { user: true },
    orderBy: { joinedAt: 'asc' },
  },
} as const;

export class PostgresChatRepository implements ChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(chatId: string): Promise<ChatRecord | null> {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: chatInclude,
    });
    return chat ? toChatRecord(chat) : null;
  }

  async findDirectByKey(directKey: string): Promise<ChatRecord | null> {
    const chat = await this.prisma.chat.findUnique({
      where: { directKey },
      include: chatInclude,
    });
    return chat ? toChatRecord(chat) : null;
  }

  async createDirect(input: CreateDirectChatInput): Promise<ChatRecord> {
    try {
      const chat = await this.prisma.chat.create({
        data: {
          type: 'DIRECT',
          directKey: input.directKey,
          createdById: input.userAId,
          members: {
            create: [
              { userId: input.userAId, role: 'MEMBER' },
              { userId: input.userBId, role: 'MEMBER' },
            ],
          },
        },

        include: chatInclude,
      });
      return toChatRecord(chat);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        const existing = await this.findDirectByKey(input.directKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async createGroup(input: CreateGroupChatInput): Promise<ChatRecord> {
    const others = [...new Set(input.memberIds)].filter((id) => id !== input.creatorId);

    const chat = await this.prisma.chat.create({
      data: {
        type: 'GROUP',
        name: input.name,
        createdById: input.creatorId,
        members: {
          create: [
            { userId: input.creatorId, role: 'OWNER' },
            ...others.map((userId) => ({ userId, role: 'MEMBER' as const })),
          ],
        },
      },

      include: chatInclude,
    });
    return toChatRecord(chat);
  }

  async listForUser(userId: string): Promise<ChatRecord[]> {
    const chats = await this.prisma.chat.findMany({
      where: { members: { some: { userId } } },
      include: chatInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return chats.map((chat) => toChatRecord(chat));
  }

  async addMembers(input: AddMembersInput): Promise<ChatRecord> {
    const role = input.role ?? 'MEMBER';

    await this.prisma.chatMember.createMany({
      data: input.userIds.map((userId) => ({ chatId: input.chatId, userId, role })),
      skipDuplicates: true,
    });

    const chat = await this.findById(input.chatId);
    if (!chat) throw AppError.notFound(`Chat ${input.chatId} no longer exists`);
    return chat;
  }

  async removeMember(chatId: string, userId: string): Promise<ChatRecord> {
    await this.prisma.chatMember.deleteMany({ where: { chatId, userId } });

    const chat = await this.findById(chatId);
    if (!chat) throw AppError.notFound(`Chat ${chatId} no longer exists`);
    return chat;
  }

  async touch(chatId: string): Promise<void> {
    await this.prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });
  }
}
