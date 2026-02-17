'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Widget {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    config: any;
    styles: any;
}

interface Overlay {
    id: string;
    name: string;
    width: number;
    height: number;
    widgets: Widget[];
    tenant: {
        id: string;
        name: string;
    };
}

interface ChatMessage {
    username: string;
    message: string;
    color?: string;
}

interface Alert {
    type: 'follow' | 'subscribe' | 'donation' | 'raid';
    username: string;
    message?: string;
    amount?: number;
}

export default function OverlayBrowserSourcePage() {
    const params = useParams();
    const urlSlug = params.slug as string;

    const [overlay, setOverlay] = useState<Overlay | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [currentAlert, setCurrentAlert] = useState<Alert | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        fetchOverlay();
    }, [urlSlug]);

    useEffect(() => {
        if (!overlay) return;

        // Connect to WebSocket for real-time events
        const newSocket = io('http://localhost:3001/overlay-events');
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to overlay events');
            newSocket.emit('subscribe', overlay.id);
        });

        newSocket.on('chat', (data: ChatMessage) => {
            setChatMessages((prev) => [...prev.slice(-9), data]); // Keep last 10 messages
        });

        newSocket.on('alert', (data: Alert) => {
            setCurrentAlert(data);
            setTimeout(() => setCurrentAlert(null), 5000); // Hide after 5 seconds
        });

        return () => {
            newSocket.disconnect();
        };
    }, [overlay]);

    const fetchOverlay = async () => {
        try {
            const res = await fetch(`http://localhost:3001/overlays/public/${urlSlug}`);
            const data = await res.json();
            setOverlay(data);
        } catch (error) {
            console.error('Failed to fetch overlay:', error);
        }
    };

    if (!overlay) {
        return null; // Transparent background while loading
    }

    return (
        <div
            className="relative"
            style={{
                width: `${overlay.width}px`,
                height: `${overlay.height}px`,
                backgroundColor: 'transparent',
            }}
        >
            {overlay.widgets.map((widget) => (
                <div
                    key={widget.id}
                    className="absolute"
                    style={{
                        left: `${widget.x}px`,
                        top: `${widget.y}px`,
                        width: `${widget.width}px`,
                        height: `${widget.height}px`,
                    }}
                >
                    {widget.type === 'chat' && (
                        <ChatWidget messages={chatMessages} config={widget.config} />
                    )}
                    {widget.type === 'alert' && currentAlert && (
                        <AlertWidget alert={currentAlert} config={widget.config} />
                    )}
                </div>
            ))}
        </div>
    );
}

// Chat Widget Component
function ChatWidget({ messages, config }: { messages: ChatMessage[]; config: any }) {
    return (
        <div className="h-full bg-black/70 rounded-lg p-4 overflow-hidden">
            <div className="space-y-2">
                {messages.map((msg, idx) => (
                    <div key={idx} className="text-white text-sm">
                        <span className="font-bold" style={{ color: msg.color || '#9146FF' }}>
                            {msg.username}:
                        </span>{' '}
                        <span>{msg.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Alert Widget Component
function AlertWidget({ alert, config }: { alert: Alert; config: any }) {
    const getMessage = () => {
        if (config.message) {
            return config.message.replace('{type}', alert.type).replace('{username}', alert.username);
        }
        return alert.message || `Thanks for the ${alert.type}!`;
    };

    return (
        <div className="h-full flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg animate-pulse">
            <div className="text-center p-6">
                <div className="text-4xl mb-2">
                    {alert.type === 'follow' && '👋'}
                    {alert.type === 'subscribe' && '⭐'}
                    {alert.type === 'donation' && '💰'}
                    {alert.type === 'raid' && '🎉'}
                </div>
                <div className="text-2xl font-bold text-white mb-2">{alert.username}</div>
                <div className="text-lg text-white/90">{getMessage()}</div>
                {alert.amount && (
                    <div className="text-xl font-bold text-yellow-300 mt-2">${alert.amount}</div>
                )}
            </div>
        </div>
    );
}
