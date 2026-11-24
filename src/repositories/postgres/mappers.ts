import type { ChatMemberRole, ChatType } from '../../generated/prisma/enums.js';
import type { ChatMemberRecord, ChatRecord, UserRecord } from '../../types/domain.js';

export interface UserRow {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMemberRow {
  userId: string;
  role: ChatMemberRole;
  joinedAt: Date;
  user?: UserRow | null;
}

export interface ChatRow {
  id: string;
  type: ChatType;
  name: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: ChatMemberRow[];
}

export function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toChatMemberRecord(row: ChatMemberRow): ChatMemberRecord {
  return {
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
    ...(row.user ? { user: toUserRecord(row.user) } : {}),
  };
}

export function toChatRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    members: row.members.map(toChatMemberRecord),
  };
}
