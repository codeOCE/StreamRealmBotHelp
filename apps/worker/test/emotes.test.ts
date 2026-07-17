import { describe, it, expect } from 'vitest';
import { buildEmoteMap, emoteUrlsInText, isValidEmoteCode, type EmoteRow } from '../src/chat/emotes';

const row = (code: string, url: string): EmoteRow => ({ id: code, code, image_url: url, width: 28, animated: false });

describe('emote codes', () => {
  it('accepts chat-typeable tokens, rejects the rest', () => {
    expect(isValidEmoteCode('catJAM')).toBe(true);
    expect(isValidEmoteCode('PogU_2')).toBe(true);
    expect(isValidEmoteCode('a')).toBe(false); // too short
    expect(isValidEmoteCode('_lead')).toBe(false); // must start alphanumeric
    expect(isValidEmoteCode('has space')).toBe(false);
    expect(isValidEmoteCode('emo:ji')).toBe(false);
  });
});

describe('buildEmoteMap', () => {
  it('lets the channel own code win a collision with an added one', () => {
    const own = [row('catJAM', 'own.gif')];
    const added = [row('catJAM', 'borrowed.gif'), row('PogU', 'pogu.png')];
    const map = buildEmoteMap(own, added);
    expect(map['catJAM'].url).toBe('own.gif');
    expect(map['PogU'].url).toBe('pogu.png');
  });
});

describe('emoteUrlsInText', () => {
  const map = buildEmoteMap([row('catJAM', 'cat.gif'), row('PogU', 'pog.png')], []);

  it('matches whole tokens case-sensitively, once per occurrence', () => {
    expect(emoteUrlsInText('hi catJAM catJAM PogU', map)).toEqual(['cat.gif', 'cat.gif', 'pog.png']);
  });
  it('does not match substrings or wrong case', () => {
    expect(emoteUrlsInText('catJAMs catjam POG', map)).toEqual([]);
  });
  it('caps the flood', () => {
    const spam = Array(50).fill('catJAM').join(' ');
    expect(emoteUrlsInText(spam, map, 25)).toHaveLength(25);
  });
});
