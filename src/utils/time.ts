import { Timestamp } from 'firebase-admin/firestore';

export function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function requireDate(value: unknown, field: string): Date {
  const date = toDate(value);
  if (!date) throw new Error(`Expected a timestamp in field "${field}"`);
  return date;
}
