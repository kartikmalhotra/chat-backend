import type { ChatDto, ChatRecord, ChatSummaryDto, ChatType, UserDto } from '../types/domain.js';
import type {
  ChatRepository,
  MessageRepository,
  UserRepository,
} from '../repositories/interfaces.js';
import { buildDirectKey } from '../utils/direct-key.js';
import { AppError } from '../utils/errors.js';
import { toChatDto, toMessageDto, toUserDto } from './dto.js';

export interface CreateDirectChatResult {
  readonly chat: ChatDto;
  readonly created: boolean;
}

export interface CreateGroupChatParams {
  readonly name: string;
  readonly creatorId: string;
  readonly memberIds: readonly string[];
}

const MANAGER_ROLES = new Set(['OWNER', 'ADMIN']);

export class ChatService {
  constructor(
    private readonly users: UserRepository,
    private readonly chats: ChatRepository,
    private readonly messages: MessageRepository,
  ) {}

  async createUser(username: string, displayName: string): Promise<UserDto> {
    return toUserDto(await this.users.create({ username, displayName }));
  }

  async getUser(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound(`User ${userId} not found`);
    return toUserDto(user);
  }

  async listUsers(limit: number): Promise<UserDto[]> {
    const users = await this.users.list(limit);
    return users.map(toUserDto);
  }

  async createOrGetDirectChat(userAId: string, userBId: string): Promise<CreateDirectChatResult> {
    if (userAId === userBId) {
      throw AppError.validation('A 1:1 chat needs two different users');
    }

    await this.assertUsersExist([userAId, userBId]);

    const directKey = buildDirectKey(userAId, userBId);

    const existing = await this.chats.findDirectByKey(directKey);
    if (existing) {
      return { chat: toChatDto(existing), created: false };
    }

    const chat = await this.chats.createDirect({ userAId, userBId, directKey });
    return { chat: toChatDto(chat), created: true };
  }

  async createGroupChat(params: CreateGroupChatParams): Promise<ChatDto> {
    const memberIds = [...new Set([params.creatorId, ...params.memberIds])];
    await this.assertUsersExist(memberIds);

    const chat = await this.chats.createGroup({
      name: params.name,
      creatorId: params.creatorId,
      memberIds,
    });
    return toChatDto(chat);
  }

  async getChatRecord(chatId: string): Promise<ChatRecord> {
    const chat = await this.chats.findById(chatId);
    if (!chat) throw AppError.notFound(`Chat ${chatId} not found`);
    return chat;
  }

  async getChat(chatId: string): Promise<ChatDto> {
    return toChatDto(await this.getChatRecord(chatId));
  }

  async requireMembership(chatId: string, userId: string): Promise<ChatRecord> {
    const chat = await this.getChatRecord(chatId);

    if (!chat.members.some((member) => member.userId === userId)) {
      throw AppError.forbidden(`User ${userId} is not a member of chat ${chatId}`);
    }
    return chat;
  }

  async listUserChats(userId: string): Promise<ChatSummaryDto[]> {
    await this.getUser(userId);

    const chats = await this.chats.listForUser(userId);

    return Promise.all(
      chats.map(async (chat): Promise<ChatSummaryDto> => {
        const [lastMessage, lastSeen, unreadCount] = await Promise.all([
          this.messages.findLatest(chat.id),
          this.messages.getLastSeen(chat.id, userId),
          this.messages.countUnread(chat.id, userId),
        ]);

        return {
          ...toChatDto(chat),
          lastMessage: lastMessage ? toMessageDto(lastMessage) : null,
          lastSeenMessageId: lastSeen?.messageId ?? null,
          unreadCount,
        };
      }),
    );
  }

  async addMembers(chatId: string, actorId: string, userIds: readonly string[]): Promise<ChatDto> {
    const chat = await this.requireMembership(chatId, actorId);
    this.assertGroupChat(chat, 'Members can only be added to group chats');
    this.assertManager(chat, actorId, 'Only the owner or an admin can add members');

    await this.assertUsersExist(userIds);

    const updated = await this.chats.addMembers({ chatId, userIds });
    return toChatDto(updated);
  }

  async removeMember(chatId: string, actorId: string, userId: string): Promise<ChatDto> {
    const chat = await this.requireMembership(chatId, actorId);
    this.assertGroupChat(chat, 'Members can only be removed from group chats');

    const target = chat.members.find((member) => member.userId === userId);
    if (!target) {
      throw AppError.notFound(`User ${userId} is not a member of chat ${chatId}`);
    }

    const isSelf = actorId === userId;
    if (!isSelf) {
      this.assertManager(chat, actorId, 'Only the owner or an admin can remove members');
      if (target.role === 'OWNER') {
        throw AppError.forbidden('The chat owner cannot be removed by another member');
      }
    }

    const updated = await this.chats.removeMember(chatId, userId);
    return toChatDto(updated);
  }

  private assertGroupChat(chat: ChatRecord, message: string): void {
    const expected: ChatType = 'GROUP';
    if (chat.type !== expected) throw AppError.validation(message);
  }

  private assertManager(chat: ChatRecord, actorId: string, message: string): void {
    const actor = chat.members.find((member) => member.userId === actorId);
    if (!actor || !MANAGER_ROLES.has(actor.role)) throw AppError.forbidden(message);
  }

  private async assertUsersExist(userIds: readonly string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;

    const found = await this.users.findManyByIds(unique);
    const foundIds = new Set(found.map((user) => user.id));
    const missing = unique.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw AppError.notFound(
        missing.length === 1 ? `User ${missing[0]} not found` : 'One or more users not found',
        { missingUserIds: missing },
      );
    }
  }
}
