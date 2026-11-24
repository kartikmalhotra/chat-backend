import type {
  ChatMemberRole,
  ChatRecord,
  LastSeenRecord,
  MessageRecord,
  UserRecord,
} from '../types/domain.js';

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
}

export interface CreateDirectChatInput {
  readonly userAId: string;
  readonly userBId: string;
  readonly directKey: string;
}

export interface CreateGroupChatInput {
  readonly name: string;
  readonly creatorId: string;
  readonly memberIds: readonly string[];
}

export interface AddMembersInput {
  readonly chatId: string;
  readonly userIds: readonly string[];
  readonly role?: ChatMemberRole;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<UserRecord>;
  findById(userId: string): Promise<UserRecord | null>;
  findManyByIds(userIds: readonly string[]): Promise<UserRecord[]>;
  list(limit: number): Promise<UserRecord[]>;
}

export interface ChatRepository {
  findById(chatId: string): Promise<ChatRecord | null>;
  findDirectByKey(directKey: string): Promise<ChatRecord | null>;
  createDirect(input: CreateDirectChatInput): Promise<ChatRecord>;
  createGroup(input: CreateGroupChatInput): Promise<ChatRecord>;
  listForUser(userId: string): Promise<ChatRecord[]>;
  addMembers(input: AddMembersInput): Promise<ChatRecord>;
  removeMember(chatId: string, userId: string): Promise<ChatRecord>;
  touch(chatId: string): Promise<void>;
}

export interface CreateMessageInput {
  readonly chatId: string;
  readonly senderId: string;
  readonly text: string;
}

export interface ListMessagesInput {
  readonly chatId: string;
  readonly limit: number;
  readonly beforeMessageId?: string;
}

export interface ListMessagesResult {
  readonly messages: readonly MessageRecord[];
  readonly hasMore: boolean;
}

export interface MarkReadInput {
  readonly chatId: string;
  readonly messageId: string;
  readonly userId: string;
}

export interface SetLastSeenInput {
  readonly chatId: string;
  readonly userId: string;
  readonly messageId: string;
  readonly messageCreatedAt: Date;
}

export interface MessageRepository {
  create(input: CreateMessageInput): Promise<MessageRecord>;
  findById(chatId: string, messageId: string): Promise<MessageRecord | null>;
  list(input: ListMessagesInput): Promise<ListMessagesResult>;
  findLatest(chatId: string): Promise<MessageRecord | null>;
  markRead(input: MarkReadInput): Promise<MessageRecord>;
  updateText(chatId: string, messageId: string, text: string): Promise<MessageRecord>;
  softDelete(chatId: string, messageId: string): Promise<MessageRecord>;
  setLastSeen(input: SetLastSeenInput): Promise<LastSeenRecord>;
  getLastSeen(chatId: string, userId: string): Promise<LastSeenRecord | null>;
  listLastSeen(chatId: string): Promise<LastSeenRecord[]>;
  countUnread(chatId: string, userId: string): Promise<number>;
}
