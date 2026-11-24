import type { PrismaClient } from '../../generated/prisma/client.js';
import type { UserRecord } from '../../types/domain.js';
import { AppError } from '../../utils/errors.js';
import type { CreateUserInput, UserRepository } from '../interfaces.js';
import { toUserRecord } from './mappers.js';
import { isUniqueViolation } from './prisma-errors.js';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      const user = await this.prisma.user.create({
        data: { username: input.username, displayName: input.displayName },
      });
      return toUserRecord(user);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict(`Username "${input.username}" is already taken`);
      }
      throw error;
    }
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? toUserRecord(user) : null;
  }

  async findManyByIds(userIds: readonly string[]): Promise<UserRecord[]> {
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({ where: { id: { in: [...userIds] } } });
    return users.map(toUserRecord);
  }

  async list(limit: number): Promise<UserRecord[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return users.map(toUserRecord);
  }
}
