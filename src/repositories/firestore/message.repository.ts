import {
  type DocumentSnapshot,
  FieldPath,
  FieldValue,
  type Firestore,
  Timestamp,
} from 'firebase-admin/firestore';

import type { LastSeenRecord, MessageRecord, ReadReceiptMap } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import { requireDate, toDate } from '../../utils/time.js';
import type {
  CreateMessageInput,
  ListMessagesInput,
  ListMessagesResult,
  MarkReadInput,
  MessageRepository,
  SetLastSeenInput,
} from '../interfaces.js';
import { lastSeenCollection, messagesCollection } from './paths.js';

function toReadReceiptMap(value: unknown): ReadReceiptMap {
  if (typeof value !== 'object' || value === null) return {};

  const receipts: Record<string, Date> = {};
  for (const [userId, readAt] of Object.entries(value as Record<string, unknown>)) {
    const date = toDate(readAt);
    if (date) receipts[userId] = date;
  }
  return receipts;
}

function toMessageRecord(snapshot: DocumentSnapshot, chatId: string): MessageRecord {
  const data = snapshot.data();
  if (!data) throw AppError.notFound(`Message ${snapshot.id} not found`);

  const text: unknown = data['text'];

  return {
    id: snapshot.id,
    chatId: typeof data['chatId'] === 'string' ? data['chatId'] : chatId,
    senderId: String(data['senderId']),
    text: typeof text === 'string' ? text : null,
    createdAt: requireDate(data['createdAt'], 'createdAt'),
    editedAt: toDate(data['editedAt']),
    deletedAt: toDate(data['deletedAt']),
    readBy: toReadReceiptMap(data['readBy']),
  };
}

function toLastSeenRecord(snapshot: DocumentSnapshot, chatId: string): LastSeenRecord | null {
  const data = snapshot.data();
  if (!data) return null;

  return {
    userId: snapshot.id,
    chatId,
    messageId: String(data['messageId']),
    messageCreatedAt: toDate(data['messageCreatedAt']),
    updatedAt: requireDate(data['updatedAt'], 'updatedAt'),
  };
}

export class FirestoreMessageRepository implements MessageRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(input: CreateMessageInput): Promise<MessageRecord> {
    const ref = messagesCollection(this.firestore, input.chatId).doc();

    await ref.set({
      chatId: input.chatId,
      senderId: input.senderId,
      text: input.text,
      createdAt: FieldValue.serverTimestamp(),
      editedAt: null,
      deletedAt: null,
      isDeleted: false,
      readBy: {},
    });

    return toMessageRecord(await ref.get(), input.chatId);
  }

  async findById(chatId: string, messageId: string): Promise<MessageRecord | null> {
    const snapshot = await messagesCollection(this.firestore, chatId).doc(messageId).get();
    return snapshot.exists ? toMessageRecord(snapshot, chatId) : null;
  }

  async list(input: ListMessagesInput): Promise<ListMessagesResult> {
    const collection = messagesCollection(this.firestore, input.chatId);

    let query = collection
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(input.limit + 1);

    if (input.beforeMessageId !== undefined) {
      const cursor = await collection.doc(input.beforeMessageId).get();
      if (!cursor.exists) {
        throw AppError.validation(`Cursor message ${input.beforeMessageId} does not exist`);
      }
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > input.limit;
    const page = hasMore ? snapshot.docs.slice(0, input.limit) : snapshot.docs;

    return {
      messages: page.map((doc) => toMessageRecord(doc, input.chatId)).reverse(),
      hasMore,
    };
  }

  async findLatest(chatId: string): Promise<MessageRecord | null> {
    const snapshot = await messagesCollection(this.firestore, chatId)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(1)
      .get();

    const [doc] = snapshot.docs;
    return doc ? toMessageRecord(doc, chatId) : null;
  }

  async markRead(input: MarkReadInput): Promise<MessageRecord> {
    const ref = messagesCollection(this.firestore, input.chatId).doc(input.messageId);

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw AppError.notFound(`Message ${input.messageId} not found in chat ${input.chatId}`);
      }

      const existing = toReadReceiptMap(snapshot.get('readBy'));

      if (existing[input.userId]) return;

      transaction.update(ref, new FieldPath('readBy', input.userId), FieldValue.serverTimestamp());
    });

    return toMessageRecord(await ref.get(), input.chatId);
  }

  async updateText(chatId: string, messageId: string, text: string): Promise<MessageRecord> {
    const ref = messagesCollection(this.firestore, chatId).doc(messageId);

    await ref.update({ text, editedAt: FieldValue.serverTimestamp() });
    return toMessageRecord(await ref.get(), chatId);
  }

  async softDelete(chatId: string, messageId: string): Promise<MessageRecord> {
    const ref = messagesCollection(this.firestore, chatId).doc(messageId);

    await ref.update({
      text: null,
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
    });
    return toMessageRecord(await ref.get(), chatId);
  }

  async setLastSeen(input: SetLastSeenInput): Promise<LastSeenRecord> {
    const ref = lastSeenCollection(this.firestore, input.chatId).doc(input.userId);

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists ? toLastSeenRecord(snapshot, input.chatId) : null;

      if (
        current?.messageCreatedAt &&
        current.messageCreatedAt.getTime() >= input.messageCreatedAt.getTime()
      ) {
        return;
      }

      transaction.set(ref, {
        userId: input.userId,
        chatId: input.chatId,
        messageId: input.messageId,
        messageCreatedAt: Timestamp.fromDate(input.messageCreatedAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const snapshot = await ref.get();
    const record = toLastSeenRecord(snapshot, input.chatId);
    if (!record) throw AppError.internal('Failed to persist last seen pointer');
    return record;
  }

  async getLastSeen(chatId: string, userId: string): Promise<LastSeenRecord | null> {
    const snapshot = await lastSeenCollection(this.firestore, chatId).doc(userId).get();
    return snapshot.exists ? toLastSeenRecord(snapshot, chatId) : null;
  }

  async listLastSeen(chatId: string): Promise<LastSeenRecord[]> {
    const snapshot = await lastSeenCollection(this.firestore, chatId).get();
    return snapshot.docs
      .map((doc) => toLastSeenRecord(doc, chatId))
      .filter((record): record is LastSeenRecord => record !== null);
  }

  async countUnread(chatId: string, userId: string): Promise<number> {
    const lastSeen = await this.getLastSeen(chatId, userId);

    let query = messagesCollection(this.firestore, chatId).where('senderId', '!=', userId);

    if (lastSeen?.messageCreatedAt) {
      query = query.where('createdAt', '>', Timestamp.fromDate(lastSeen.messageCreatedAt));
    }

    const snapshot = await query.count().get();
    return snapshot.data().count;
  }
}
