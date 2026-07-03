import { AwsClient } from 'aws4fetch';
import type { Env } from '../env';
import type { SupabaseClient } from '@supabase/supabase-js';
import { botSchema } from './supabase';

/** Default tip message length (common tipping-page default). */
export const TTS_DEFAULT_MESSAGE_CHARS = 255;

/** Polly / speech API byte ceiling. */
export const TTS_MAX_BYTES = 3000;

export function truncateToBytes(text: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return text;
  let out = text;
  while (out.length > 0 && enc.encode(out).length > maxBytes) out = out.slice(0, -1);
  return out;
}

/** Spoken text = tip message only, capped by creator setting then byte limit. */
export function formatTipTtsText(message: string, maxChars = TTS_DEFAULT_MESSAGE_CHARS): string {
  const charCap = Math.min(500, Math.max(20, maxChars));
  const trimmed = message.trim().slice(0, charCap);
  return truncateToBytes(trimmed, TTS_MAX_BYTES);
}

function pollyRegion(env: Env): string {
  return env.AWS_REGION?.trim() || 'us-east-1';
}

function pollyVoice(env: Env): string {
  return env.POLLY_VOICE_ID?.trim() || 'Brian';
}

function pollyEngine(env: Env): 'standard' | 'neural' {
  const e = (env.POLLY_ENGINE ?? 'standard').toLowerCase();
  return e === 'neural' ? 'neural' : 'standard';
}

export function pollyConfigured(env: Env): boolean {
  return !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin);
}

type BudgetRow = {
  tts_monthly_char_limit: number;
  tts_chars_used: number;
  tts_usage_month: string;
  max_message_length: number;
};

async function loadBudget(bot: ReturnType<typeof botSchema>, streamerId: string): Promise<BudgetRow> {
  const { data } = await bot
    .from('tip_settings')
    .select('tts_monthly_char_limit, tts_chars_used, tts_usage_month, max_message_length')
    .eq('streamer_id', streamerId)
    .maybeSingle();
  const month = currentMonth();
  const limit = data?.tts_monthly_char_limit ?? 50_000;
  let used = data?.tts_chars_used ?? 0;
  const storedMonth = data?.tts_usage_month ?? '';
  if (storedMonth !== month) used = 0;
  return {
    tts_monthly_char_limit: limit,
    tts_chars_used: used,
    tts_usage_month: month,
    max_message_length: data?.max_message_length ?? TTS_DEFAULT_MESSAGE_CHARS,
  };
}

async function addUsage(
  bot: ReturnType<typeof botSchema>,
  streamerId: string,
  chars: number,
  budget: BudgetRow,
): Promise<void> {
  const month = currentMonth();
  const used = (budget.tts_usage_month === month ? budget.tts_chars_used : 0) + chars;
  await bot
    .from('tip_settings')
    .upsert(
      {
        streamer_id: streamerId,
        tts_chars_used: used,
        tts_usage_month: month,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'streamer_id' },
    );
}

async function callPolly(env: Env, text: string): Promise<ArrayBuffer | null> {
  const region = pollyRegion(env);
  const voice = pollyVoice(env);
  const engine = pollyEngine(env);
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    region,
  });
  const res = await aws.fetch(`https://polly.${region}.amazonaws.com/v1/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Text: text,
      TextType: 'text',
      VoiceId: voice,
      OutputFormat: 'mp3',
      Engine: engine,
    }),
  });
  if (!res.ok) {
    console.error('[polly]', res.status, await res.text().catch(() => ''));
    return null;
  }
  return res.arrayBuffer();
}

export interface SynthesizeResult {
  dataUrl: string;
  chars: number;
}

export async function synthesizeTipTts(
  env: Env,
  supabase: SupabaseClient,
  streamerId: string,
  message: string,
): Promise<SynthesizeResult | null> {
  if (!pollyConfigured(env)) return null;

  const bot = botSchema(supabase);
  const budget = await loadBudget(bot, streamerId);
  const text = formatTipTtsText(message, budget.max_message_length);
  if (!text) return null;
  if (budget.tts_chars_used + text.length > budget.tts_monthly_char_limit) return null;

  const audio = await callPolly(env, text);
  if (!audio) return null;

  await addUsage(bot, streamerId, text.length, budget);
  return { dataUrl: `data:audio/mpeg;base64,${bytesToBase64(audio)}`, chars: text.length };
}
