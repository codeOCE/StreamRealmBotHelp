export const DEFAULT_ALERT_HTML = `<div id="alert">
  <div class="icon">🔔</div>
  <div class="content">
    <div class="event-label">New Follower!</div>
    <div class="username">{username}</div>
    <div class="message">{message}</div>
  </div>
</div>`;

export const DEFAULT_ALERT_CSS = `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: transparent;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

#alert {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 36px;
  background: rgba(5, 7, 10, 0.92);
  border: 1px solid rgba(63, 170, 255, 0.35);
  border-radius: 18px;
  text-align: center;
  animation: alertIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  box-shadow: 0 0 40px rgba(63, 170, 255, 0.12), 0 24px 60px rgba(0,0,0,0.6);
  backdrop-filter: blur(20px);
}

.icon {
  font-size: 44px;
  animation: iconPulse 1.2s ease-in-out infinite;
}

.event-label {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: rgba(255,255,255,0.35);
}

.username {
  font-size: 30px;
  font-weight: 900;
  color: #3faaff;
  letter-spacing: -0.02em;
}

.message {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  font-style: italic;
  max-width: 280px;
  line-height: 1.5;
}

@keyframes alertIn {
  from { opacity: 0; transform: scale(0.85) translateY(16px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1) rotate(0deg); }
  25%       { transform: scale(1.15) rotate(-8deg); }
  75%       { transform: scale(1.1) rotate(8deg); }
}`;

export const DEFAULT_ALERT_JS = `// window.alertData = { type, username, message, amount, tier }
const TITLES = {
  follow:    'New Follower!',
  subscribe: 'New Subscriber!',
  cheer:     'Cheered!',
  raid:      'Incoming Raid!',
  donation:  'Donation!',
};

if (window.alertData) {
  const { type, message } = window.alertData;

  const labelEl = document.querySelector('.event-label');
  if (labelEl) labelEl.textContent = TITLES[type] || 'Alert!';

  const msgEl = document.querySelector('.message');
  if (msgEl) {
    if (message) {
      msgEl.textContent = '"' + message + '"';
    } else {
      msgEl.remove();
    }
  }
}`;

export interface AlertData {
    type: string;
    username: string;
    message?: string;
    amount?: number;
    tier?: string;
    /** Name of the matched variation (e.g. "Big Cheer"); '' when none. */
    variant?: string;
    /** When true, overlay reads the tip message aloud (browser TTS fallback). */
    speakMessage?: boolean;
    /** Polly MP3 URL (preferred). */
    ttsUrl?: string | null;
}

export interface AlertSound {
    url: string;
    /** 0..1, defaults to 0.8. */
    volume?: number;
}

/**
 * Amount-threshold variation of an event's alert (e.g. cheer >= 1000 bits).
 * The highest matching minAmount wins; unset fields fall back to the event
 * config. `name` is exposed to templates as {variant} / alertData.variant.
 */
export interface AlertVariation {
    name: string;
    minAmount: number;
    duration?: number;
    sound?: AlertSound | null;
}

/** Play donation TTS on the overlay. */
export function speakDonationAlert(alert: AlertData): void {
    if (alert.type !== 'donation') return;
    if (alert.ttsUrl) {
        void import('@/lib/tts').then(({ playTtsUrl }) => playTtsUrl(alert.ttsUrl!).catch(() => undefined));
        return;
    }
    if (!alert.speakMessage || !alert.message?.trim()) return;
    void import('@/lib/tts').then(({ speakTipMessage }) =>
        speakTipMessage(alert.username ?? 'Anonymous', alert.message!).catch(() => undefined),
    );
}

/** Emoji per event type, shared by the Event List widget (editor + overlay). */
export const EVENT_ICONS: Record<string, string> = {
    follow: '❤', subscribe: '★', resub: '★', cheer: '◆', raid: '⚔', donation: '✦', gift: '🎁',
};

/** Short past-tense line for an event in the Event List widget. */
export function eventListLabel(ev: { type: string; amount?: number }): string {
    switch (ev.type) {
        case 'follow': return 'followed';
        case 'subscribe': return 'subscribed';
        case 'cheer': return `cheered ${ev.amount || 0}`;
        case 'raid': return `raided · ${ev.amount || 0}`;
        case 'donation': return `tipped ${ev.amount || 0}`;
        case 'gift': return 'gifted a sub';
        default: return '';
    }
}

export interface AlertEventConfig {
    enabled: boolean;
    duration: number;
    minAmount?: number;
    sound?: AlertSound | null;
    variations?: AlertVariation[];
}

export function getAlertEventConfig(config: Record<string, any>, eventType: string): AlertEventConfig {
    const ev = config?.events?.[eventType];
    const globalDuration = config?.duration ?? 5000;
    if (ev === undefined || ev === null) return { enabled: true, duration: globalDuration };
    if (typeof ev === 'boolean') return { enabled: ev, duration: globalDuration };
    return {
        enabled: ev.enabled !== false,
        duration: ev.duration ?? globalDuration,
        minAmount: ev.minAmount,
        sound: ev.sound?.url ? ev.sound : null,
        variations: Array.isArray(ev.variations) ? ev.variations : [],
    };
}

/**
 * Effective duration / sound / variant name for an alert. The variation with
 * the highest minAmount <= amount wins; anything it doesn't override falls
 * back to the event config.
 */
export function resolveAlertPresentation(
    config: Record<string, any>,
    alertData: AlertData,
): { duration: number; sound: AlertSound | null; variant: string } {
    const evCfg = getAlertEventConfig(config, alertData.type);
    const amount = alertData.amount ?? 0;
    let best: AlertVariation | null = null;
    for (const v of evCfg.variations ?? []) {
        const min = v.minAmount ?? 0;
        if (amount >= min && (!best || min > (best.minAmount ?? 0))) best = v;
    }
    return {
        duration: best?.duration ?? evCfg.duration,
        sound: best?.sound?.url ? best.sound : evCfg.sound ?? null,
        variant: best?.name ?? '',
    };
}

export function isAlertEventAllowed(config: Record<string, any>, alertData: AlertData): boolean {
    const evCfg = getAlertEventConfig(config, alertData.type);
    if (!evCfg.enabled) return false;
    if (evCfg.minAmount && (alertData.amount ?? 0) < evCfg.minAmount) return false;
    return true;
}

export function buildAlertSrcDoc(config: Record<string, any>, alertData: AlertData): string {
    const html = config.htmlTemplate ?? DEFAULT_ALERT_HTML;
    const css  = config.customCss   ?? DEFAULT_ALERT_CSS;
    const js   = config.customJs    ?? DEFAULT_ALERT_JS;

    const safe = {
        type:     alertData.type     ?? 'follow',
        username: alertData.username ?? 'StreamFan',
        message:  alertData.message  ?? '',
        amount:   alertData.amount   ?? 0,
        tier:     alertData.tier     ?? '',
        variant:  alertData.variant  ?? '',
        speakMessage: !!alertData.speakMessage,
    };

    const processedHtml = html
        .replace(/\{username\}/g, safe.username)
        .replace(/\{type\}/g,     safe.type)
        .replace(/\{message\}/g,  safe.message)
        .replace(/\{amount\}/g,   String(safe.amount))
        .replace(/\{tier\}/g,     safe.tier)
        .replace(/\{variant\}/g,  safe.variant);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style>
</head>
<body>
<script>window.alertData = ${JSON.stringify(safe)};</script>
${processedHtml}
<script>${js}</script>
</body>
</html>`;
}
