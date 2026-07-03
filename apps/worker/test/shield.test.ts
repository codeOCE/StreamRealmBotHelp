import { describe, it, expect } from 'vitest';
import { shieldReason } from '../src/chat/shield';

describe('shieldReason (hate-raid / follow-bot decision)', () => {
  const ageOnly = { enabled: true, maxAccountAgeDays: 7, requireFollow: false };

  it('blocks a brand-new account', () => {
    expect(shieldReason({ ageDays: 0.5, following: null }, ageOnly)).toMatch(/account/);
  });

  it('lets an old account through', () => {
    expect(shieldReason({ ageDays: 400, following: null }, ageOnly)).toBeNull();
  });

  it('exactly at the threshold is allowed (younger-than, not equal)', () => {
    expect(shieldReason({ ageDays: 7, following: null }, ageOnly)).toBeNull();
  });

  it('fails OPEN on unknown age — a Helix hiccup must not mass-ban', () => {
    expect(shieldReason({ ageDays: null, following: null }, ageOnly)).toBeNull();
  });

  it('age check is off when maxAccountAgeDays is 0', () => {
    expect(shieldReason({ ageDays: 0.1, following: null }, { ...ageOnly, maxAccountAgeDays: 0 })).toBeNull();
  });

  it('requireFollow blocks a confirmed non-follower', () => {
    expect(shieldReason({ ageDays: 999, following: false }, { ...ageOnly, requireFollow: true })).toBe('not following');
  });

  it('requireFollow allows a follower', () => {
    expect(shieldReason({ ageDays: 999, following: true }, { ...ageOnly, requireFollow: true })).toBeNull();
  });

  it('requireFollow fails open when follow status is unknown', () => {
    expect(shieldReason({ ageDays: 999, following: null }, { ...ageOnly, requireFollow: true })).toBeNull();
  });
});
