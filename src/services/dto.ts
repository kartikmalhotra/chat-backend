import type {
  ChatDto,
  ChatMemberDto,
  ChatRecord,
  LastSeenDto,
  LastSeenRecord,
  MessageDto,
  MessageRecord,
  ReadReceiptDto,
  UserDto,
  UserRecord,
} from '../types/domain.js';

export function toUserDto(record: UserRecord): UserDto {
  return {
    userId: record.id,
    username: record.username,
    displayName: record.displayName,
    createdAt: record.createdAt.toISOString(),
  };
}

function toChatMemberDto(record: ChatRecord['members'][number]): ChatMemberDto {
  return {
    userId: record.userId,
    role: record.role,
    joinedAt: record.joinedAt.toISOString(),
    ...(record.user
      ? { username: record.user.username, displayName: record.user.displayName }
      : {}),
  };
}

export function toChatDto(record: ChatRecord): ChatDto {
  return {
    chatId: record.id,
    type: record.type,
    name: record.name,
    memberIds: record.members.map((member) => member.userId),
    members: record.members.map(toChatMemberDto),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toReadReceiptDtos(record: MessageRecord): ReadReceiptDto[] {
  return Object.entries(record.readBy)
    .map(([userId, readAt]) => ({ userId, readAt: readAt.toISOString() }))
    .sort((left, right) => left.readAt.localeCompare(right.readAt));
}

export function toMessageDto(record: MessageRecord): MessageDto {
  return {
    messageId: record.id,
    chatId: record.chatId,
    senderId: record.senderId,
    text: record.text,
    createdAt: record.createdAt.toISOString(),
    editedAt: record.editedAt ? record.editedAt.toISOString() : null,
    deletedAt: record.deletedAt ? record.deletedAt.toISOString() : null,
    isDeleted: record.deletedAt !== null,
    isEdited: record.editedAt !== null,
    readBy: toReadReceiptDtos(record),
  };
}

export function toLastSeenDto(record: LastSeenRecord): LastSeenDto {
  return {
    userId: record.userId,
    chatId: record.chatId,
    messageId: record.messageId,
    updatedAt: record.updatedAt.toISOString(),
  };
}
