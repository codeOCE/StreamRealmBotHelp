import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import { botSchema } from '../lib/supabase';
import { getSpotifyAccessToken, findTrack, queueTrack, currentTrack } from '../lib/spotify';
import { hasPermission } from './logic';
import type { UserLevel } from './moderation';

/**
 * Song requests over the creator's Spotify (see lib/spotify.ts).
 *
 *   !sr <song or spotify link>   queue a track
 *   !song                        what's playing now
 */

export const SONG_TRIGGERS = new Set(['sr', 'songrequest', 'song', 'currentsong', 'nowplaying']);

export async function handleSongCommand(opts: {
  env: Env;
  supabase: SupabaseClient;
  streamerId: string;
  settings: Record<string, any>;
  level: UserLevel;
  viewerName: string;
  trigger: string;
  args: string[];
  say: (message: string) => Promise<boolean>;
}): Promise<void> {
  const { env, supabase, streamerId, settings, level, viewerName, trigger, args, say } = opts;
  const sp = settings.spotify;
  if (!sp?.accessToken) return; // not connected — stay silent so !song can be a custom command
  if (sp.srEnabled === false) return;

  const bot = botSchema(supabase);
  const token = await getSpotifyAccessToken(env, bot, streamerId, settings);
  if (!token) {
    await say(`@${viewerName}, song requests are unavailable right now (Spotify needs a reconnect).`);
    return;
  }

  if (trigger === 'song' || trigger === 'currentsong' || trigger === 'nowplaying') {
    const track = await currentTrack(token);
    await say(track ? `🎵 Now playing: ${track.name} — ${track.artist}` : 'Nothing is playing right now.');
    return;
  }

  // !sr
  if (!hasPermission(level, String(sp.srLevel ?? 'VIEWER'))) return;
  const query = args.join(' ').trim();
  if (!query) {
    await say(`@${viewerName}, usage: !sr <song name or Spotify link>`);
    return;
  }
  const track = await findTrack(token, query);
  if (!track) {
    await say(`@${viewerName}, couldn't find that song.`);
    return;
  }
  const result = await queueTrack(token, track.uri);
  if (result === 'ok') {
    await say(`@${viewerName} queued: ${track.name} — ${track.artist}`);
  } else if (result === 'no_device') {
    await say(`@${viewerName}, Spotify isn't playing on any device right now — the streamer needs to hit play first.`);
  } else {
    await say(`@${viewerName}, couldn't queue that song. Try again in a bit.`);
  }
}
