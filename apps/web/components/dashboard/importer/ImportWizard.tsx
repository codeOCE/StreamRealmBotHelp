"use client";

import { ImportProvider, useImport } from "./ImportContext";
import { ImportStepConnect } from "./ImportStepConnect";
import { ImportStepSelect } from "./ImportStepSelect";
import { ImportStepMigrating } from "./ImportStepMigrating";

export function ImportWizard({ onComplete, onClose }: { onComplete?: (items: any[]) => void, onClose?: () => void }) {
    return (
        <ImportProvider onComplete={onComplete}>
            <ImportWizardContent onClose={onClose} />
        </ImportProvider>
    );
}

function ImportWizardContent({ onClose }: { onClose?: () => void }) {
    const { state } = useImport();

    return (
        <div className="w-full max-w-4xl mx-auto">
            <div className="glass-card border border-white/10 rounded-[2rem] overflow-hidden bg-slate-950/40 backdrop-blur-xl shadow-2xl shadow-brand-primary/5">
                <div className="p-10">
                    {state.step === 'connect' && <ImportStepConnect />}
                    {state.step === 'select' && <ImportStepSelect />}
                    {state.step === 'migrating' && <ImportStepMigrating />}
                    {state.step === 'complete' && (
                        <div className="text-center py-12 space-y-6 animate-in zoom-in-95 duration-500">
                            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
                                <span className="text-5xl">🎉</span>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black text-white uppercase italic">Migration Success!</h3>
                                <p className="text-zinc-400 text-sm font-bold uppercase tracking-[0.2em]">
                                    All selected commands have been imported.
                                </p>
                            </div>

                            <div className="pt-8">
                                <button
                                    onClick={onClose}
                                    className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                                >
                                    Finish & View Commands
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
