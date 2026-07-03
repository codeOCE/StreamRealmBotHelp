"use client";

import { ImportProvider, useImport, ImportDataType } from "./ImportContext";
import { ImportStepConnect } from "./ImportStepConnect";
import { ImportStepSelect } from "./ImportStepSelect";
import { ImportStepMigrating } from "./ImportStepMigrating";

export function ImportWizard({ onComplete, onClose }: { onComplete?: (items: any[], dataType: ImportDataType) => void, onClose?: () => void }) {
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
                            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 text-emerald-400">
                                <svg width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black text-white uppercase italic">Migration Success!</h3>
                                <p className="text-zinc-400 text-sm font-bold ">
                                    All selected {state.dataType} have been imported.
                                </p>
                            </div>

                            <div className="pt-8">
                                <button
                                    onClick={onClose}
                                    className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black  text-xs rounded-xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
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
