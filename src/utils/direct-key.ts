export function buildDirectKey(userAId: string, userBId: string): string {
  return [userAId, userBId]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join(':');
}
