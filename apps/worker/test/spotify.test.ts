import { describe, it, expect } from 'vitest';
import { parseTrackId } from '../src/lib/spotify';
import { renderTemplate, isValidWebhookUrl } from '../src/lib/discord';

describe('spotify track links', () => {
  it('parses track ids from links and URIs', () => {
    expect(parseTrackId('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT');
    expect(parseTrackId('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x')).toBe('4cOdK2wGLETKBW3PvgPWqT');
    expect(parseTrackId('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT')).toBe('4cOdK2wGLETKBW3PvgPWqT');
    expect(parseTrackId('never gonna give you up')).toBeNull();
  });
});

describe('discord go-live', () => {
  it('renders message templates', () => {
    expect(renderTemplate('{name} live! {game} — {url}', { name: 'Nick', title: 't', game: 'Tetris', url: 'https://twitch.tv/n' }))
      .toBe('Nick live! Tetris — https://twitch.tv/n');
  });
  it('validates webhook URLs', () => {
    expect(isValidWebhookUrl('https://discord.com/api/webhooks/123/abc-DEF_ghi')).toBe(true);
    expect(isValidWebhookUrl('https://ptb.discord.com/api/webhooks/123/abc')).toBe(true);
    expect(isValidWebhookUrl('https://evil.com/api/webhooks/123/abc')).toBe(false);
    expect(isValidWebhookUrl('not a url')).toBe(false);
  });
});
