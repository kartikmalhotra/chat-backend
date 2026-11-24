import type { ChatRepository, MessageRepository } from '../repositories/interfaces.js';
import type { LastSeenDto, MessageDto, MessageRecord, PageInfoDto } from '../types/domain.js';
import { AppError } from '../utils/errors.js';
import type { ChatService } from './chat.service.js';
import { toLastSeenDto, toMessageDto } from './dto.js';

export interface MessagePageOptions {
  readonly limit?: number;
  readonly beforeMessageId?: string;
}

export interface MessagePage {
  readonly messages: readonly MessageDto[];
  readonly pageInfo: PageInfoDto;
}

export interface PageSizeConfig {
  readonly defaultLimit: number;
  readonly maxLimit: number;
}

export class MessageService {
  constructor(
    private readonly chatService: ChatService,
    private readonly chats: ChatRepository,
    private readonly messages: MessageRepository,
    private readonly pageSize: PageSizeConfig,
  ) {}

  async sendMessage(chatId: string, senderId: string, text: string): Promise<MessageDto> {
    await this.chatService.requireMembership(chatId, senderId);

    const message = await this.messages.create({ chatId, senderId, text });

    await this.chats.touch(chatId);

    return toMessageDto(message);
  }

  async getMessages(chatId: string, options: MessagePageOptions = {}): Promise<MessagePage> {
    await this.chatService.getChatRecord(chatId);

    const limit = Math.min(options.limit ?? this.pageSize.defaultLimit, this.pageSize.maxLimit);

    const result = await this.messages.list({
      chatId,
      limit,
      ...(options.beforeMessageId !== undefined
        ? { beforeMessageId: options.beforeMessageId }
        : {}),
    });

    const messages = result.messages.map(toMessageDto);
    const oldest = messages[0];

    return {
      messages,
      pageInfo: {
        limit,
        count: messages.length,
        hasMore: result.hasMore,
        nextBefore: result.hasMore && oldest ? oldest.messageId : null,
      },
    };
  }

  async markMessageRead(chatId: string, messageId: string, userId: string): Promise<MessageDto> {
    await this.chatService.requireMembership(chatId, userId);
    await this.requireMessage(chatId, messageId);

    const message = await this.messages.markRead({ chatId, messageId, userId });
    return toMessageDto(message);
  }

  async updateLastSeen(chatId: string, userId: string, messageId: string): Promise<LastSeenDto> {
    await this.chatService.requireMembership(chatId, userId);
    const message = await this.requireMessage(chatId, messageId);

    const record = await this.messages.setLastSeen({
      chatId,
      userId,
      messageId,
      messageCreatedAt: message.createdAt,
    });
    return toLastSeenDto(record);
  }

  async listLastSeen(chatId: string): Promise<LastSeenDto[]> {
    await this.chatService.getChatRecord(chatId);

    const records = await this.messages.listLastSeen(chatId);
    return records.map(toLastSeenDto);
  }

  async editMessage(
    chatId: string,
    messageId: string,
    userId: string,
    text: string,
  ): Promise<MessageDto> {
    await this.chatService.requireMembership(chatId, userId);
    const message = await this.requireMessage(chatId, messageId);

    if (message.senderId !== userId) {
      throw AppError.forbidden('Only the author of a message can edit it');
    }

    if (message.deletedAt !== null) {
      throw AppError.validation('A deleted message cannot be edited');
    }

    if (message.text === text) {
      return toMessageDto(message);
    }

    return toMessageDto(await this.messages.updateText(chatId, messageId, text));
  }

  async deleteMessage(chatId: string, messageId: string, userId: string): Promise<MessageDto> {
    await this.chatService.requireMembership(chatId, userId);
    const message = await this.requireMessage(chatId, messageId);

    if (message.senderId !== userId) {
      throw AppError.forbidden('Only the author of a message can delete it');
    }

    if (message.deletedAt !== null) {
      return toMessageDto(message);
    }

    return toMessageDto(await this.messages.softDelete(chatId, messageId));
  }

  private async requireMessage(chatId: string, messageId: string): Promise<MessageRecord> {
    const message = await this.messages.findById(chatId, messageId);
    if (!message) {
      throw AppError.notFound(`Message ${messageId} not found in chat ${chatId}`);
    }
    return message;
  }
}
