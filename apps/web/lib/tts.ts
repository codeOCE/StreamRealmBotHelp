import { apiUrl } from '@/lib/api';

/** Browser fallback only — Polly path speaks message text on the server. */
export function formatTipTtsText(message: string): string {
    return message.trim();
}

function playAudioUrl(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('Playback failed'));
        void audio.play().catch(reject);
    });
}

function speakBrowserFallback(message: string): Promise<void> {
    const text = formatTipTtsText(message);
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
        return Promise.reject(new Error('TTS not available'));
    }
    return new Promise((resolve, reject) => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => resolve();
        u.onerror = () => reject(new Error('TTS playback failed'));
        window.speechSynthesis.speak(u);
    });
}

export async function speakTipMessage(_donorName: string, message: string): Promise<void> {
    const res = await fetch(apiUrl('/api/tips/tts/preview'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
    if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) {
            await playAudioUrl(data.url);
            return;
        }
    }
    await speakBrowserFallback(message);
}

export function playTtsUrl(url: string): Promise<void> {
    return playAudioUrl(url);
}
