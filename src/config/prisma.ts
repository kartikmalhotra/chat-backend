import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';
import { logger } from './logger.js';

export function createPrismaClient(connectionString: string = env.DATABASE_URL): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  client ??= createPrismaClient();
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (!client) return;
  await client.$disconnect();
  client = undefined;
  logger.debug('PostgreSQL connection pool closed');
}
