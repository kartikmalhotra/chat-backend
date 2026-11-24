import type { ChatMemberRole, ChatType } from '../generated/prisma/enums.js';

export type { ChatMemberRole, ChatType };

export interface UserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ChatMemberRecord {
  readonly userId: string;
  readonly role: ChatMemberRole;
  readonly joinedAt: Date;
  readonly user?: UserRecord;
}

export interface ChatRecord {
  readonly id: string;
  readonly type: ChatType;
  readonly name: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly members: readonly ChatMemberRecord[];
}

export type ReadReceiptMap = Readonly<Record<string, Date>>;

export interface MessageRecord {
  readonly id: string;
  readonly chatId: string;
  readonly senderId: string;
  readonly text: string | null;
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly readBy: ReadReceiptMap;
}

export interface LastSeenRecord {
  readonly userId: string;
  readonly chatId: string;
  readonly messageId: string;
  readonly messageCreatedAt: Date | null;
  readonly updatedAt: Date;
}

export interface ReadReceiptDto {
  readonly userId: string;
  readonly readAt: string;
}

export interface MessageDto {
  readonly messageId: string;
  readonly chatId: string;
  readonly senderId: string;
  readonly text: string | null;
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly deletedAt: string | null;
  readonly isDeleted: boolean;
  readonly isEdited: boolean;
  readonly readBy: readonly ReadReceiptDto[];
}

export interface ChatMemberDto {
  readonly userId: string;
  readonly role: ChatMemberRole;
  readonly joinedAt: string;
  readonly username?: string;
  readonly displayName?: string;
}

export interface ChatDto {
  readonly chatId: string;
  readonly type: ChatType;
  readonly name: string | null;
  readonly memberIds: readonly string[];
  readonly members: readonly ChatMemberDto[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ChatSummaryDto extends ChatDto {
  readonly lastMessage: MessageDto | null;
  readonly lastSeenMessageId: string | null;
  readonly unreadCount: number;
}

export interface UserDto {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly createdAt: string;
}

export interface LastSeenDto {
  readonly userId: string;
  readonly chatId: string;
  readonly messageId: string;
  readonly updatedAt: string;
}

export interface PageInfoDto {
  readonly limit: number;
  readonly count: number;
  readonly hasMore: boolean;
  readonly nextBefore: string | null;
}
