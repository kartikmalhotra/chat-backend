import type { CollectionReference, Firestore } from 'firebase-admin/firestore';

export const CHATS_COLLECTION = 'chats';
export const MESSAGES_COLLECTION = 'messages';
export const LAST_SEEN_COLLECTION = 'lastSeen';

export function messagesCollection(firestore: Firestore, chatId: string): CollectionReference {
  return firestore.collection(CHATS_COLLECTION).doc(chatId).collection(MESSAGES_COLLECTION);
}

export function lastSeenCollection(firestore: Firestore, chatId: string): CollectionReference {
  return firestore.collection(CHATS_COLLECTION).doc(chatId).collection(LAST_SEEN_COLLECTION);
}
