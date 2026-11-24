import { randomUUID } from 'node:crypto';

import type {
  AddMembersInput,
  ChatRepository,
  CreateDirectChatInput,
  CreateGroupChatInput,
  CreateMessageInput,
  CreateUserInput,
  ListMessagesInput,
  ListMessagesResult,
  MarkReadInput,
  MessageRepository,
  SetLastSeenInput,
  UserRepository,
} from '../../src/repositories/interfaces.js';
import type {
  ChatMemberRecord,
  ChatRecord,
  LastSeenRecord,
  MessageRecord,
  UserRecord,
} from '../../src/types/domain.js';
import { AppError } from '../../src/utils/errors.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();

  async create(input: CreateUserInput): Promise<UserRecord> {
    for (const user of this.users.values()) {
      if (user.username === input.username) {
        throw AppError.conflict(`Username "${input.username}" is already taken`);
      }
    }

    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      username: input.username,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findById(userId: string): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async findManyByIds(userIds: readonly string[]): Promise<UserRecord[]> {
    return userIds
      .map((id) => this.users.get(id))
      .filter((user): user is UserRecord => user !== undefined);
  }

  async list(limit: number): Promise<UserRecord[]> {
    return [...this.users.values()]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }
}

interface StoredChat {
  id: string;
  type: ChatRecord['type'];
  name: string | null;
  directKey: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: ChatMemberRecord[];
}

export class InMemoryChatRepository implements ChatRepository {
  private readonly chats = new Map<string, StoredChat>();
  constructor(private readonly users?: UserRepository) {}

  async findById(chatId: string): Promise<ChatRecord | null> {
    const chat = this.chats.get(chatId);
    return chat ? await this.hydrate(chat) : null;
  }

  async findDirectByKey(directKey: string): Promise<ChatRecord | null> {
    for (const chat of this.chats.values()) {
      if (chat.directKey === directKey) return this.hydrate(chat);
    }
    return null;
  }

  async createDirect(input: CreateDirectChatInput): Promise<ChatRecord> {
    const existing = await this.findDirectByKey(input.directKey);
    if (existing) return existing;

    const now = new Date();
    const chat: StoredChat = {
      id: randomUUID(),
      type: 'DIRECT',
      name: null,
      directKey: input.directKey,
      createdById: input.userAId,
      createdAt: now,
      updatedAt: now,
      members: [
        { userId: input.userAId, role: 'MEMBER', joinedAt: now },
        { userId: input.userBId, role: 'MEMBER', joinedAt: now },
      ],
    };
    this.chats.set(chat.id, chat);
    return this.hydrate(chat);
  }

  async createGroup(input: CreateGroupChatInput): Promise<ChatRecord> {
    const now = new Date();
    const others = [...new Set(input.memberIds)].filter((id) => id !== input.creatorId);

    const chat: StoredChat = {
      id: randomUUID(),
      type: 'GROUP',
      name: input.name,
      directKey: null,
      createdById: input.creatorId,
      createdAt: now,
      updatedAt: now,
      members: [
        { userId: input.creatorId, role: 'OWNER', joinedAt: now },
        ...others.map((userId) => ({ userId, role: 'MEMBER' as const, joinedAt: now })),
      ],
    };
    this.chats.set(chat.id, chat);
    return this.hydrate(chat);
  }

  async listForUser(userId: string): Promise<ChatRecord[]> {
    const chats = [...this.chats.values()]
      .filter((chat) => chat.members.some((member) => member.userId === userId))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

    return Promise.all(chats.map((chat) => this.hydrate(chat)));
  }

  async addMembers(input: AddMembersInput): Promise<ChatRecord> {
    const chat = this.require(input.chatId);
    const now = new Date();

    for (const userId of input.userIds) {
      if (chat.members.some((member) => member.userId === userId)) continue;
      chat.members.push({ userId, role: input.role ?? 'MEMBER', joinedAt: now });
    }
    return this.hydrate(chat);
  }

  async removeMember(chatId: string, userId: string): Promise<ChatRecord> {
    const chat = this.require(chatId);
    chat.members = chat.members.filter((member) => member.userId !== userId);
    return this.hydrate(chat);
  }

  async touch(chatId: string): Promise<void> {
    this.require(chatId).updatedAt = new Date();
  }

  private require(chatId: string): StoredChat {
    const chat = this.chats.get(chatId);
    if (!chat) throw AppError.notFound(`Chat ${chatId} not found`);
    return chat;
  }

  private async hydrate(chat: StoredChat): Promise<ChatRecord> {
    const members: ChatMemberRecord[] = [];

    for (const member of chat.members) {
      const user = await this.users?.findById(member.userId);
      members.push({ ...member, ...(user ? { user } : {}) });
    }

    return {
      id: chat.id,
      type: chat.type,
      name: chat.name,
      createdById: chat.createdById,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      members,
    };
  }
}

interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  text: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  readBy: Record<string, Date>;
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly messages = new Map<string, StoredMessage[]>();
  private readonly lastSeen = new Map<string, Map<string, LastSeenRecord>>();
  private sequence = 0;
  private lastTimestamp = 0;
  private nextTimestamp(): Date {
    this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);
    return new Date(this.lastTimestamp);
  }

  async create(input: CreateMessageInput): Promise<MessageRecord> {
    const message: StoredMessage = {
      id: `msg_${String(++this.sequence).padStart(10, '0')}`,
      chatId: input.chatId,
      senderId: input.senderId,
      text: input.text,
      createdAt: this.nextTimestamp(),
      editedAt: null,
      deletedAt: null,
      readBy: {},
    };

    const chatMessages = this.messages.get(input.chatId) ?? [];
    chatMessages.push(message);
    this.messages.set(input.chatId, chatMessages);

    return toRecord(message);
  }

  async findById(chatId: string, messageId: string): Promise<MessageRecord | null> {
    const message = this.find(chatId, messageId);
    return message ? toRecord(message) : null;
  }

  async list(input: ListMessagesInput): Promise<ListMessagesResult> {
    const descending = this.sorted(input.chatId).reverse();

    let startIndex = 0;
    if (input.beforeMessageId !== undefined) {
      const cursorIndex = descending.findIndex((message) => message.id === input.beforeMessageId);
      if (cursorIndex === -1) {
        throw AppError.validation(`Cursor message ${input.beforeMessageId} does not exist`);
      }
      startIndex = cursorIndex + 1;
    }

    const window = descending.slice(startIndex, startIndex + input.limit + 1);
    const hasMore = window.length > input.limit;
    const page = hasMore ? window.slice(0, input.limit) : window;

    return { messages: page.map(toRecord).reverse(), hasMore };
  }

  async findLatest(chatId: string): Promise<MessageRecord | null> {
    const sorted = this.sorted(chatId);
    const latest = sorted[sorted.length - 1];
    return latest ? toRecord(latest) : null;
  }

  async markRead(input: MarkReadInput): Promise<MessageRecord> {
    const message = this.require(input.chatId, input.messageId);

    message.readBy[input.userId] ??= new Date();

    return toRecord(message);
  }

  async updateText(chatId: string, messageId: string, text: string): Promise<MessageRecord> {
    const message = this.require(chatId, messageId);
    message.text = text;
    message.editedAt = new Date();
    return toRecord(message);
  }

  async softDelete(chatId: string, messageId: string): Promise<MessageRecord> {
    const message = this.require(chatId, messageId);
    message.text = null;
    message.deletedAt = new Date();
    return toRecord(message);
  }

  async setLastSeen(input: SetLastSeenInput): Promise<LastSeenRecord> {
    const perChat = this.lastSeen.get(input.chatId) ?? new Map<string, LastSeenRecord>();
    const current = perChat.get(input.userId);

    if (
      current?.messageCreatedAt &&
      current.messageCreatedAt.getTime() >= input.messageCreatedAt.getTime()
    ) {
      return current;
    }

    const record: LastSeenRecord = {
      userId: input.userId,
      chatId: input.chatId,
      messageId: input.messageId,
      messageCreatedAt: input.messageCreatedAt,
      updatedAt: new Date(),
    };
    perChat.set(input.userId, record);
    this.lastSeen.set(input.chatId, perChat);
    return record;
  }

  async getLastSeen(chatId: string, userId: string): Promise<LastSeenRecord | null> {
    return this.lastSeen.get(chatId)?.get(userId) ?? null;
  }

  async listLastSeen(chatId: string): Promise<LastSeenRecord[]> {
    return [...(this.lastSeen.get(chatId)?.values() ?? [])];
  }

  async countUnread(chatId: string, userId: string): Promise<number> {
    const lastSeen = await this.getLastSeen(chatId, userId);
    const threshold = lastSeen?.messageCreatedAt?.getTime() ?? null;

    return this.sorted(chatId).filter(
      (message) =>
        message.senderId !== userId &&
        (threshold === null || message.createdAt.getTime() > threshold),
    ).length;
  }

  private sorted(chatId: string): StoredMessage[] {
    return [...(this.messages.get(chatId) ?? [])].sort((left, right) => {
      const byTime = left.createdAt.getTime() - right.createdAt.getTime();
      return byTime !== 0 ? byTime : left.id.localeCompare(right.id);
    });
  }

  private find(chatId: string, messageId: string): StoredMessage | undefined {
    return this.messages.get(chatId)?.find((message) => message.id === messageId);
  }

  private require(chatId: string, messageId: string): StoredMessage {
    const message = this.find(chatId, messageId);
    if (!message) throw AppError.notFound(`Message ${messageId} not found in chat ${chatId}`);
    return message;
  }
}

function toRecord(message: StoredMessage): MessageRecord {
  return {
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    text: message.text,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    readBy: { ...message.readBy },
  };
}

export interface InMemoryStack {
  readonly userRepository: InMemoryUserRepository;
  readonly chatRepository: InMemoryChatRepository;
  readonly messageRepository: InMemoryMessageRepository;
}

export function createInMemoryStack(): InMemoryStack {
  const userRepository = new InMemoryUserRepository();
  return {
    userRepository,
    chatRepository: new InMemoryChatRepository(userRepository),
    messageRepository: new InMemoryMessageRepository(),
  };
}
