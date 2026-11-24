import { env } from '../src/config/env.js';
import { getFirestoreClient } from '../src/config/firebase.js';
import { disconnectPrisma, getPrismaClient } from '../src/config/prisma.js';
import { FirestoreMessageRepository } from '../src/repositories/firestore/message.repository.js';
import { PostgresChatRepository } from '../src/repositories/postgres/chat.repository.js';
import { PostgresUserRepository } from '../src/repositories/postgres/user.repository.js';
import { ChatService } from '../src/services/chat.service.js';
import { MessageService } from '../src/services/message.service.js';

const DEMO_USERS = [
  { username: 'alice', displayName: 'Alice Anderson' },
  { username: 'bob', displayName: 'Bob Brown' },
  { username: 'carol', displayName: 'Carol Clark' },
] as const;

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const firestore = getFirestoreClient();

  const chatService = new ChatService(
    new PostgresUserRepository(prisma),
    new PostgresChatRepository(prisma),
    new FirestoreMessageRepository(firestore),
  );
  const messageService = new MessageService(
    chatService,
    new PostgresChatRepository(prisma),
    new FirestoreMessageRepository(firestore),
    { defaultLimit: env.MESSAGE_PAGE_SIZE_DEFAULT, maxLimit: env.MESSAGE_PAGE_SIZE_MAX },
  );

  const users = await Promise.all(
    DEMO_USERS.map((user) =>
      prisma.user.upsert({
        where: { username: user.username },
        update: { displayName: user.displayName },
        create: user,
      }),
    ),
  );

  const [alice, bob, carol] = users;
  if (!alice || !bob || !carol) throw new Error('Failed to seed demo users');

  const { chat: direct } = await chatService.createOrGetDirectChat(alice.id, bob.id);

  const group = await chatService.createGroupChat({
    name: 'Weekend plans',
    creatorId: alice.id,
    memberIds: [bob.id, carol.id],
  });

  const first = await messageService.sendMessage(
    direct.chatId,
    alice.id,
    'Hey Bob, standup at 10?',
  );
  const second = await messageService.sendMessage(direct.chatId, bob.id, 'Works for me.');
  await messageService.sendMessage(direct.chatId, alice.id, 'See you then.');

  await messageService.markMessageRead(direct.chatId, first.messageId, bob.id);
  await messageService.updateLastSeen(direct.chatId, alice.id, second.messageId);

  await messageService.sendMessage(group.chatId, carol.id, 'Trek on Saturday?');

  console.log('Seed complete:');
  console.table([
    ...users.map((user) => ({ kind: 'user', id: user.id, label: user.username })),
    { kind: 'chat (1:1)', id: direct.chatId, label: 'alice <-> bob' },
    { kind: 'chat (group)', id: group.chatId, label: 'Weekend plans' },
  ]);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void disconnectPrisma();
  });
