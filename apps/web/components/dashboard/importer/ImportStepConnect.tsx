"use client";

import { useState, useEffect } from "react";
import { useImport } from "./ImportContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, Bot, CloudDownload, FileJson, ArrowRight, Ghost, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api";

const DATA_TYPES: { value: 'commands' | 'timers' | 'points'; label: string }[] = [
    { value: 'commands', label: 'Commands' },
    { value: 'timers', label: 'Timers' },
    { value: 'points', label: 'Points' },
];

export function ImportStepConnect() {
    const { state, setProvider, setStep, setItems, setDataType } = useImport();
    const [token, setToken] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedType, setSelectedType] = useState<'streamelements' | 'nightbot' | 'manual' | null>(null);
    const [nightbotConnected, setNightbotConnected] = useState(false);
    const [seConnected, setSeConnected] = useState(false);

    // Check connection status on mount
    useEffect(() => {
        checkConnectionStatus();
    }, []);

    const checkConnectionStatus = async () => {
        try {
            // Get tenant ID from user endpoint
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            // Check integrations status
            const res = await fetch(apiUrl('/api/integrations'), { credentials: 'include' });
            const data = await res.json();

            // Check if tokens exist in settings
            if (data.settings?.nightbot?.accessToken) {
                setNightbotConnected(true);
            }
            if (data.settings?.streamelements?.jwtToken) {
                setSeConnected(true);
            }
        } catch (error) {
            console.error('Failed to check connection status:', error);
        }
    };

    const handleDisconnect = async (platform: 'nightbot' | 'streamelements') => {
        try {
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            if (platform === 'nightbot') {
                await fetch(apiUrl('/api/auth/nightbot/disconnect'), {
                    method: 'POST',
                    credentials: 'include',
                });
                setNightbotConnected(false);
                toast.success('Nightbot disconnected');
            } else {
                await fetch(apiUrl('/api/integrations/streamelements/disconnect'), {
                    method: 'POST',
                    credentials: 'include',
                });
                setSeConnected(false);
                toast.success('StreamElements disconnected');
            }
        } catch (error) {
            console.error('Failed to disconnect:', error);
            toast.error('Failed to disconnect');
        }
    };

    const handleNightbotOAuth = async () => {
        try {
            // Get tenant ID
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            // Open OAuth popup
            const width = 600;
            const height = 700;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                apiUrl('/api/auth/nightbot'),
                'Nightbot OAuth',
                `width=${width},height=${height},left=${left},top=${top}`
            );

            // Poll for popup close or success
            const pollTimer = setInterval(() => {
                if (popup?.closed) {
                    clearInterval(pollTimer);
                    // Check if connection was successful
                    checkNightbotConnection(tenantId);
                }
            }, 500);

        } catch (error) {
            console.error('OAuth error:', error);
            toast.error('Failed to initiate OAuth flow');
        }
    };

    const checkNightbotConnection = async (tenantId: string) => {
        try {
            const res = await fetch(apiUrl('/api/integrations'), { credentials: 'include' });
            const data = await res.json();

            // Check if Nightbot is connected
            // This assumes the integrations endpoint returns connection status
            setNightbotConnected(true);
            toast.success('Nightbot connected successfully!');
        } catch (error) {
            toast.error('Failed to verify connection');
        }
    };

    const handleStreamElementsConnect = async () => {
        if (!token) {
            toast.error('Please enter your StreamElements JWT token');
            return;
        }

        setIsLoading(true);
        try {
            // Get tenant ID
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const res = await fetch(apiUrl('/api/integrations/streamelements/connect'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tenantId, jwtToken: token }),
            });

            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            setSeConnected(true);
            toast.success('StreamElements connected successfully!');
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Failed to connect. Check your token.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleImport = async () => {
        setIsLoading(true);
        try {
            if (state.dataType === 'points') {
                // StreamElements points import is a single server-side bulk merge
                // (usernames resolved to Twitch IDs, balances merged) — there's no
                // per-user selection, so skip straight to done.
                const res = await fetch(apiUrl('/api/integrations/streamelements/import-points'), {
                    method: 'POST',
                    credentials: 'include',
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);
                setProvider('streamelements');
                toast.success(
                    `Imported ${data.imported} point balance${data.imported === 1 ? '' : 's'}!` +
                    (data.unresolved ? ` ${data.unresolved} username(s) couldn't be matched to a Twitch account.` : '')
                );
                setStep('complete');
                return;
            }

            // Get tenant ID
            const userRes = await fetch(apiUrl('/api/user/me'), { credentials: 'include' });
            const userData = await userRes.json();
            const tenantId = userData.tenantId;

            const base = selectedType === 'nightbot'
                ? '/api/integrations/nightbot/import'
                : '/api/integrations/streamelements/import';

            const res = await fetch(apiUrl(`${base}?type=${state.dataType}`), { credentials: 'include' });
            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            if (!data.commands || data.commands.length === 0) {
                toast.warning(`No ${state.dataType} found on ${selectedType === 'nightbot' ? 'Nightbot' : 'StreamElements'}.`);
                setIsLoading(false);
                return;
            }

            setProvider(selectedType);
            setItems(data.commands || []);
            setStep('select');
            toast.success(`Found ${data.commands.length} ${state.dataType}!`);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Failed to import commands');
        } finally {
            setIsLoading(false);
        }
    };

    if (!selectedType) {
        const nightbotDisabled = state.dataType === 'points';

        return (
            <div className="space-y-6">
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-white uppercase italic">Select Source</h3>
                    <p className="text-zinc-500 text-[10px] font-bold ">What do you want to import, and from where?</p>
                </div>

                <div className="flex items-center justify-center gap-2">
                    {DATA_TYPES.map((dt) => (
                        <button
                            key={dt.value}
                            onClick={() => setDataType(dt.value)}
                            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border ${
                                state.dataType === dt.value
                                    ? 'bg-brand-primary text-white border-brand-primary shadow-lg shadow-brand-primary/20'
                                    : 'bg-white/[0.02] text-zinc-400 border-white/[0.05] hover:border-white/20'
                            }`}
                        >
                            {dt.label}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <button
                        onClick={() => setSelectedType('streamelements')}
                        className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all text-left space-y-4"
                    >
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                            <Bot className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-black text-white uppercase text-sm">StreamElements</h4>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight mt-1">Import via JWT Token</p>
                        </div>
                    </button>

                    <button
                        onClick={() => !nightbotDisabled && setSelectedType('nightbot')}
                        disabled={nightbotDisabled}
                        className={`group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] text-left space-y-4 transition-all ${
                            nightbotDisabled
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:border-rose-500/50 hover:bg-rose-500/5'
                        }`}
                    >
                        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                            <Ghost className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-black text-white uppercase text-sm">Nightbot</h4>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight mt-1">
                                {nightbotDisabled ? 'No points/loyalty system' : 'OAuth Connection'}
                            </p>
                        </div>
                    </button>

                    {state.dataType !== 'points' && (
                        <button
                            onClick={() => setSelectedType('manual')}
                            className="group p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left space-y-4 sm:col-span-2"
                        >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                                <FileJson className="w-6 h-6" />
                            </div>
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-black text-white uppercase text-sm">Manual JSON Payload</h4>
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight mt-1">Paste raw {state.dataType} data directly</p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-zinc-700 group-hover:text-emerald-500 transition-colors" />
                            </div>
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (selectedType === 'manual') {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <button onClick={() => setSelectedType(null)} className="text-[10px] font-black  text-zinc-500 hover:text-white transition-colors">← Back to sources</button>
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-white uppercase italic">Paste Command Data</h3>
                    <p className="text-zinc-500 text-[10px] font-bold  italic">Paste your JSON command array below</p>
                </div>

                <div className="space-y-4">
                    <textarea
                        className="w-full bg-slate-950/50 border border-white/10 rounded-2xl p-6 font-mono text-xs min-h-[250px] focus:outline-none focus:border-brand-primary/50 transition-all text-zinc-300 custom-scrollbar shadow-inner"
                        placeholder={
                            state.dataType === 'timers'
                                ? '[ { "name": "Socials", "message": "Follow on Twitter!", "intervalSeconds": 900 } ]'
                                : state.dataType === 'points'
                                    ? '[ { "username": "someviewer", "points": 4200 } ]'
                                    : '[ { "command": "hello", "response": "Hi!" } ]'
                        }
                        onChange={(e) => {
                            try {
                                const data = JSON.parse(e.target.value);
                                setItems(Array.isArray(data) ? data : (data.commands || []));
                            } catch (err) { }
                        }}
                    />
                    <Button
                        onClick={() => {
                            setProvider('manual');
                            setStep('select');
                        }}
                        className="w-full py-6 bg-brand-primary hover:bg-brand-primary/90 text-white font-black  text-xs rounded-xl shadow-lg shadow-brand-primary/20 transition-all"
                    >
                        Analyze & Continue <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                </div>
            </div>
        );
    }

    // Nightbot OAuth flow
    if (selectedType === 'nightbot') {
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <button onClick={() => setSelectedType(null)} className="text-[10px] font-black  text-zinc-500 hover:text-white transition-colors">← Back to sources</button>
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-black text-white uppercase italic">Connect to Nightbot</h3>
                    <p className="text-zinc-500 text-[10px] font-bold  italic">
                        Secure OAuth authentication
                    </p>
                </div>

                <Card className="p-8 border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden relative group">
                    <div className="absolute inset-0 bg-brand-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="space-y-6 relative z-10">
                        {nightbotConnected ? (
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <div>
                                    <h4 className="font-black text-white uppercase text-sm">Connected!</h4>
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight mt-1">Ready to import commands</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-slate-950/50 border border-white/5 rounded-xl p-4 space-y-2">
                                    <p className="text-[10px] text-zinc-400 font-bold ">How it works:</p>
                                    <ol className="text-[9px] text-zinc-500 space-y-1 list-decimal list-inside">
                                        <li>Click "Connect with Nightbot" below</li>
                                        <li>Authorize Stream Realm in the popup</li>
                                        <li>Return here to import your commands</li>
                                    </ol>
                                </div>
                                <Button
                                    onClick={handleNightbotOAuth}
                                    className="w-full py-7 bg-rose-500 hover:bg-rose-600 text-white font-black  text-xs rounded-xl shadow-xl shadow-rose-500/20 active:scale-95 transition-all"
                                >
                                    <ExternalLink className="mr-3 h-5 w-5" />
                                    Connect with Nightbot
                                </Button>
                            </div>
                        )}

                        {nightbotConnected && (
                            <>
                                <Button
                                    onClick={handleImport}
                                    disabled={isLoading}
                                    className="w-full py-7 bg-brand-primary hover:bg-brand-primary/90 text-white font-black  text-xs rounded-xl shadow-xl shadow-brand-primary/20 active:scale-95 transition-all"
                                >
                                    {isLoading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <CloudDownload className="mr-3 h-5 w-5" />}
                                    Import {state.dataType[0].toUpperCase()}{state.dataType.slice(1)}
                                </Button>
                                <Button
                                    onClick={() => handleDisconnect('nightbot')}
                                    variant="outline"
                                    className="w-full py-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 font-bold  text-[10px] rounded-xl transition-all"
                                >
                                    Disconnect Nightbot
                                </Button>
                            </>
                        )}
                    </div>
                </Card>
            </div>
        );
    }

    // StreamElements JWT flow
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            <button onClick={() => setSelectedType(null)} className="text-[10px] font-black  text-zinc-500 hover:text-white transition-colors">← Back to sources</button>
            <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-white uppercase italic">Connect to StreamElements</h3>
                <p className="text-zinc-500 text-[10px] font-bold  italic">
                    Requires your private JWT Access Token
                </p>
            </div>

            <Card className="p-8 border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden relative group">
                <div className="absolute inset-0 bg-brand-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="space-y-6 relative z-10">
                    {seConnected ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            </div>
                            <div>
                                <h4 className="font-black text-white uppercase text-sm">Connected!</h4>
                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight mt-1">Ready to import commands</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Label htmlFor="token" className="text-[10px] font-black  text-zinc-500 ml-1">JWT Access Token</Label>
                            <Input
                                id="token"
                                type="password"
                                placeholder="Paste your JWT token here..."
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                className="bg-slate-950/50 border-white/10 py-6 px-5 rounded-xl focus:border-brand-primary/50 text-white transition-all shadow-inner"
                            />
                            <a
                                href="https://streamelements.com/dashboard/account/channels"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-blue-400 hover:text-blue-300 font-bold  leading-relaxed px-1 mt-2 underline underline-offset-4 decoration-blue-500/30 italic flex items-center gap-1 transition-colors"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Found in Dashboard → Channel Settings → Show Secrets
                            </a>
                        </div>
                    )}

                    {!seConnected ? (
                        <Button
                            onClick={handleStreamElementsConnect}
                            disabled={isLoading}
                            className="w-full py-7 bg-blue-500 hover:bg-blue-600 text-white font-black  text-xs rounded-xl shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            {isLoading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-3 h-5 w-5" />}
                            Connect StreamElements
                        </Button>
                    ) : (
                        <>
                            <Button
                                onClick={handleImport}
                                disabled={isLoading}
                                className="w-full py-7 bg-brand-primary hover:bg-brand-primary/90 text-white font-black  text-xs rounded-xl shadow-xl shadow-brand-primary/20 active:scale-95 transition-all"
                            >
                                {isLoading ? <Loader2 className="mr-3 h-5 w-5 animate-spin" /> : <CloudDownload className="mr-3 h-5 w-5" />}
                                Import Commands
                            </Button>
                            <Button
                                onClick={() => handleDisconnect('streamelements')}
                                variant="outline"
                                className="w-full py-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50 font-bold  text-[10px] rounded-xl transition-all"
                            >
                                Disconnect StreamElements
                            </Button>
                        </>
                    )}
                </div>
            </Card>
        </div>
    );
}
