import { describe, expect, it } from 'vitest';

import { buildDirectKey } from '../../src/utils/direct-key.js';

describe('buildDirectKey', () => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  it('is order independent, so (A, B) and (B, A) map to the same chat', () => {
    expect(buildDirectKey(userA, userB)).toBe(buildDirectKey(userB, userA));
  });

  it('sorts the ids into "<smaller>:<larger>"', () => {
    expect(buildDirectKey(userB, userA)).toBe(`${userA}:${userB}`);
  });

  it('keeps different pairs distinct', () => {
    const userC = '33333333-3333-4333-8333-333333333333';
    expect(buildDirectKey(userA, userB)).not.toBe(buildDirectKey(userA, userC));
  });
});
