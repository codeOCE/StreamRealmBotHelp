'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Music } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import { buildAlertSrcDoc, isAlertEventAllowed, getAlertEventConfig, EVENT_ICONS, eventListLabel, speakDonationAlert } from '@/lib/alert-renderer';
import { getAnimationStyle } from '@/lib/widget-animations';
import { isBundleWidget, getWidgetDefinition } from '@/lib/widgets/registry';
import { buildWidgetSrcDoc, normalizeEvent } from '@/lib/widgets/runtime';
import type { OverlayEvent, ChannelContext } from '@/lib/widgets/types';
import { ChatList } from '@/lib/chat-config';

interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    config: Record<string, any>;
    styles: Record<string, any>;
    zIndex: number;
}

export default function PublicOverlayPage() {
    const params = useParams();
    const slug = params.slug as string;
    const [overlay, setOverlay] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [messages, setMessages] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [activeAlert, setActiveAlert] = useState<any>(null);
    const [goalData, setGoalData] = useState<Record<string, number>>({});
    const [currentSong, setCurrentSong] = useState<any>(null);
    // Monotonic bus event for bundle widgets — every realtime event normalized to
    // the OverlayEvent shape and fanned into each widget iframe via postMessage.
    const [busEvent, setBusEvent] = useState<{ seq: number; ev: OverlayEvent } | null>(null);
    const busSeqRef = useRef(0);
    const socketRef = useRef<(() => void) | null>(null);
    const overlayRef = useRef<any>(null);
    const alertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const alertQueueRef = useRef<any[]>([]);
    const alertPlayingRef = useRef(false);

    useEffect(() => {
        const fetchOverlay = async () => {
            try {
                setLoading(true);
                const res = await fetch(apiUrl(`/api/overlays/public/${slug}`));
                if (!res.ok) {
                    if (res.status === 404) throw new Error('Overlay not found');
                    throw new Error('Failed to load overlay');
                }
                const data = await res.json();
                overlayRef.current = data;
                setOverlay(data);
                initSocket(data.id);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (slug) fetchOverlay();

        return () => {
            if (socketRef.current) socketRef.current();
            if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
            alertQueueRef.current = [];
            alertPlayingRef.current = false;
        };
    }, [slug]);

    const playNextAlert = useCallback(() => {
        if (alertQueueRef.current.length === 0) {
            alertPlayingRef.current = false;
            setActiveAlert(null);
            return;
        }
        const next = alertQueueRef.current.shift();
        setActiveAlert(next);
        alertPlayingRef.current = true;
        speakDonationAlert(next);

        const alertWidget = overlayRef.current?.widgets?.find((w: Widget) => w.type === 'alert');
        const duration = getAlertEventConfig(alertWidget?.config ?? {}, next.type).duration;

        alertTimerRef.current = setTimeout(() => {
            setActiveAlert(null);
            // Brief gap before next alert so the exit animation can play
            setTimeout(playNextAlert, 350);
        }, duration);
    }, []);

    const initSocket = (overlayId: string) => {
        if (socketRef.current) return;
        socketRef.current = connectRealtime(`overlay:${overlayId}`, (event, data) => {
            // Fan every event out to bundle widgets in the normalized shape.
            const norm = normalizeEvent(event, data);
            if (norm) setBusEvent({ seq: ++busSeqRef.current, ev: norm });

            switch (event) {
                case 'chat':
                    // Tag arrival time (lifetime fade) + default platform (Twitch today).
                    setMessages(prev => [...prev.slice(-50), { platform: 'twitch', ...data, _t: Date.now() }]);
                    break;
                case 'alert': {
                    // Event List widget shows every event (independent of alert-box filters).
                    setEvents(prev => [data, ...prev].slice(0, 50));
                    const alertWidget = overlayRef.current?.widgets?.find((w: Widget) => w.type === 'alert');
                    // Filter: check enabled + conditions (min amount etc.)
                    if (!isAlertEventAllowed(alertWidget?.config ?? {}, data)) break;
                    // Queue and play
                    alertQueueRef.current.push(data);
                    if (!alertPlayingRef.current) playNextAlert();
                    break;
                }
                case 'goal-update':
                    setGoalData(prev => ({ ...prev, [data.type]: data.value }));
                    break;
                case 'song.update':
                    if (data?.song) setCurrentSong(data.song);
                    break;
            }
        });
    };

    if (loading || error) {
        return <div className="w-screen h-screen bg-transparent pointer-events-none" />;
    }

    const uniqueFonts = Array.from(new Set(
        overlay.widgets
            .filter((w: Widget) => w.type !== 'alert')
            .map((w: Widget) => w.styles.fontFamily)
            .filter(Boolean)
    ));

    return (
        <div
            className="relative overflow-hidden bg-transparent"
            style={{ width: overlay.width || 1920, height: overlay.height || 1080 }}
        >
            {uniqueFonts.map((font: any) => (
                <link key={font} rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${font?.replace(/\s+/g, '+')}:wght@400;700;900&display=swap`} />
            ))}

            {overlay.widgets.map((widget: Widget) => {
                // Bundle widgets (the widget standard) render as a sandboxed iframe
                // driven by the injected onWidgetLoad / onEventReceived API.
                if (isBundleWidget(widget.type)) {
                    return (
                        <BundleWidget
                            key={widget.id}
                            widget={widget}
                            busEvent={busEvent}
                            channel={{
                                id: overlay.id,
                                name: overlay.tenant?.name ?? overlay.name ?? '',
                                slug: slug,
                            }}
                        />
                    );
                }

                // Alert widgets render as a sandboxed iframe — fully custom HTML/CSS/JS
                if (widget.type === 'alert') {
                    if (!activeAlert) return null;
                    return (
                        <div
                            key={widget.id}
                            className="absolute overflow-hidden"
                            style={{
                                left: widget.x,
                                top: widget.y,
                                width: widget.width,
                                height: widget.height,
                                transform: `rotate(${widget.rotation}deg)`,
                                zIndex: widget.zIndex,
                            }}
                        >
                            <iframe
                                key={JSON.stringify(activeAlert)}
                                srcDoc={buildAlertSrcDoc(widget.config, activeAlert)}
                                sandbox="allow-scripts"
                                className="w-full h-full border-0"
                                style={{ background: 'transparent' }}
                                title="Alert"
                            />
                        </div>
                    );
                }

                return (
                    <div
                        key={widget.id}
                        className="absolute overflow-hidden"
                        style={{
                            left: widget.x,
                            top: widget.y,
                            width: widget.width,
                            height: widget.height,
                            transform: `rotate(${widget.rotation}deg)`,
                            zIndex: widget.zIndex,
                            color: widget.styles.color || '#ffffff',
                            fontSize: widget.styles.fontSize || (widget.type === 'text' ? 24 : (widget.type === 'label' ? 20 : 14)),
                            fontWeight: widget.styles.fontWeight || 700,
                            opacity: widget.styles.opacity ?? 1,
                            backgroundColor: widget.type === 'chat' ? 'transparent' : (widget.styles.backgroundColor || (widget.type === 'text' ? 'transparent' : 'rgba(38, 38, 38, 0.8)')),
                            borderRadius: widget.styles.borderRadius || 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: widget.styles.fontFamily ? `'${widget.styles.fontFamily}', sans-serif` : 'inherit',
                        }}
                    >
                      <div className="w-full h-full flex flex-col items-center justify-center" style={getAnimationStyle(widget.config.animation)}>
                        {widget.type === 'text' && (
                            <div className="w-full h-full whitespace-pre-wrap flex items-center justify-center text-center p-2">
                                {widget.config.text || ''}
                            </div>
                        )}

                        {widget.type === 'image' && widget.config.src && (
                            <img
                                src={widget.config.src}
                                alt=""
                                className="w-full h-full"
                                style={{ objectFit: widget.styles.objectFit || 'cover', borderRadius: widget.styles.borderRadius || 0 }}
                            />
                        )}

                        {widget.type === 'label' && (
                            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                <div className="text-[10px] font-black uppercase tracking-tighter opacity-40 mb-1">{widget.config.labelTitle}</div>
                                <div className="text-xl font-black truncate w-full">{widget.config.value || '...'}</div>
                            </div>
                        )}

                        {widget.type === 'goal' && (
                            <div className="w-full h-full p-4 flex flex-col justify-center gap-2">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{widget.config.title || 'Goal'}</span>
                                    <span className="text-sm font-black">
                                        {goalData[widget.config.goalType] || widget.config.current || 0} / {widget.config.target || 100}
                                    </span>
                                </div>
                                <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden border border-white/5 shadow-inner">
                                    <div
                                        className="h-full transition-[width] duration-1000 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                                        style={{
                                            width: `${Math.min(100, ((goalData[widget.config.goalType] || widget.config.current || 0) / (widget.config.target || 100)) * 100)}%`,
                                            backgroundColor: widget.styles.barColor || '#3faaff'
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {widget.type === 'chat' && (
                            <ChatList messages={messages} config={widget.config} styles={widget.styles} />
                        )}

                        {widget.type === 'spotify-player' && (
                            <div className="w-full h-full p-4 flex flex-col items-center justify-center bg-transparent">
                                <div className="relative w-full aspect-square mb-3">
                                    {currentSong?.albumArt ? (
                                        <img
                                            src={currentSong.albumArt}
                                            alt="Album Art"
                                            className="w-full h-full object-cover rounded-2xl shadow-2xl border border-white/10"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-[#0a0c10] rounded-2xl flex items-center justify-center border border-white/10">
                                            <Music size={48} className="text-white/20" />
                                        </div>
                                    )}
                                </div>
                                <div className="w-full text-center space-y-1">
                                    <div className="text-lg font-black truncate leading-tight tracking-tighter">
                                        {currentSong?.title || 'No song playing'}
                                    </div>
                                    <div className="text-sm font-medium text-white/60 truncate italic">
                                        {currentSong?.artist || ''}
                                    </div>
                                </div>
                                {currentSong?.duration > 0 && (
                                    <div className="w-full mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-brand-primary shadow-[0_0_10px_rgba(63,170,255,0.5)] transition-[width] duration-1000"
                                            style={{ width: `${((currentSong?.progress || 0) / currentSong.duration) * 100}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {widget.type === 'eventlist' && (
                            <div className="w-full h-full flex flex-col gap-1.5 p-3 overflow-hidden text-left" style={{ color: widget.styles.color || '#ffffff' }}>
                                {widget.config.title && (
                                    <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-0.5">{widget.config.title}</div>
                                )}
                                {events.slice(0, widget.config.max ?? 5).map((e, i) => (
                                    <div key={i} className="flex items-center gap-2 text-sm animate-in slide-in-from-left-2 fade-in duration-300">
                                        <span className="shrink-0">{EVENT_ICONS[e.type] ?? '•'}</span>
                                        <span className="font-bold truncate">{e.username}</span>
                                        <span className="opacity-60 truncate">{eventListLabel(e)}</span>
                                    </div>
                                ))}
                                {events.length === 0 && <div className="opacity-30 text-xs italic">Waiting for events…</div>}
                            </div>
                        )}
                      </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Host for a single bundle widget. Renders the sandboxed iframe and bridges the
 * normalized event bus into it: posts onWidgetLoad (with this widget's fieldData)
 * once the iframe signals ready, then forwards each bus event whose listener the
 * widget's definition subscribes to.
 */
function BundleWidget({
    widget,
    busEvent,
    channel,
}: {
    widget: Widget;
    busEvent: { seq: number; ev: OverlayEvent } | null;
    channel: ChannelContext;
}) {
    const def = getWidgetDefinition(widget.type);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const readyRef = useRef(false);

    const postLoad = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { __scHost: true, kind: 'load', fieldData: widget.config ?? {}, channel },
            '*',
        );
    }, [widget.config, channel]);

    // Respond to the iframe's `ready` handshake with a fresh load.
    useEffect(() => {
        const onMsg = (e: MessageEvent) => {
            if (e.source !== iframeRef.current?.contentWindow) return;
            if (e.data?.__scWidget && e.data.kind === 'ready') {
                readyRef.current = true;
                postLoad();
            }
        };
        window.addEventListener('message', onMsg);
        return () => window.removeEventListener('message', onMsg);
    }, [postLoad]);

    // Forward bus events this widget subscribes to.
    useEffect(() => {
        if (!busEvent || !def) return;
        if (!def.listens.includes(busEvent.ev.listener)) return;
        iframeRef.current?.contentWindow?.postMessage(
            { __scHost: true, kind: 'event', listener: busEvent.ev.listener, event: busEvent.ev.event },
            '*',
        );
    }, [busEvent, def]);

    if (!def?.bundle) return null;

    return (
        <div
            className="absolute overflow-hidden"
            style={{
                left: widget.x, top: widget.y, width: widget.width, height: widget.height,
                transform: `rotate(${widget.rotation}deg)`, zIndex: widget.zIndex,
                opacity: widget.styles?.opacity ?? 1,
            }}
        >
            <iframe
                ref={iframeRef}
                srcDoc={buildWidgetSrcDoc(def, widget.config ?? {}, channel)}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
                style={{ background: 'transparent' }}
                title={def.name}
            />
        </div>
    );
}
