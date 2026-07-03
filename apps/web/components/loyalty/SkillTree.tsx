'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { Background, Controls, Node, Edge, useNodesState, useEdgesState, Position, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SkillNode {
    id: string;
    name: string;
    description: string;
    effectType: string;
    effectValue: number;
    cost: number;
    parentId: string | null;
}

interface SkillTreeProps {
    tenantId: string;
    userId: string; // Twitch User ID
    currentSkillPoints: number;
    initialSkills: SkillNode[]; // Renamed for clarity or just use this source
    initialUnlocked: string[];
    onSkillUnlock: (cost: number) => void;
}

const SkillTree: React.FC<SkillTreeProps> = ({ tenantId, userId, currentSkillPoints, initialSkills, initialUnlocked, onSkillUnlock }) => {
    const [skills, setSkills] = useState<SkillNode[]>(initialSkills || []);
    const [unlockedSkillIds, setUnlockedSkillIds] = useState<Set<string>>(new Set(initialUnlocked));
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);

    // Update state when props change (e.g. after refresh)
    useEffect(() => {
        if (initialSkills) setSkills(initialSkills);
        if (initialUnlocked) setUnlockedSkillIds(new Set(initialUnlocked));
    }, [initialSkills, initialUnlocked]);

    // Layout Logic (Simple Tree)
    useEffect(() => {
        if (skills.length === 0) return;

        const newNodes: Node[] = skills.map((skill, index) => {
            let x = 250;
            let y = 0;

            if (!skill.parentId) {
                x = 250;
                y = 50;
            } else {
                y = (index + 1) * 120;
                x = (index % 2 === 0) ? 100 : 400;
            }

            if (skill.id === 'root') { x = 250; y = 50; }
            if (skill.id === 'luck1') { x = 120; y = 220; }
            if (skill.id === 'xp1') { x = 380; y = 220; }
            if (skill.id === 'luck2') { x = 120; y = 400; }
            if (skill.id === 'heist1') { x = 380; y = 400; }

            const isUnlocked = unlockedSkillIds.has(skill.id);
            const parent = skills.find(s => s.id === skill.parentId);
            const parentUnlocked = parent ? unlockedSkillIds.has(parent.id) : true;
            const canUnlock = !isUnlocked && parentUnlocked;

            return {
                id: skill.id,
                type: 'default',
                data: { label: skill.name },
                position: { x, y },
                style: {
                    background: isUnlocked ? 'rgba(124, 58, 237, 0.2)' : (canUnlock ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255, 255, 255, 0.02)'),
                    color: isUnlocked ? '#fff' : (canUnlock ? '#22d3ee' : '#666'),
                    border: selectedSkill?.id === skill.id
                        ? '2px solid #7c3aed'
                        : (isUnlocked ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)'),
                    borderRadius: '1.25rem',
                    padding: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    boxShadow: isUnlocked ? '0 0 20px rgba(124, 58, 237, 0.2)' : 'none',
                    width: 160,
                },
            };
        });

        const newEdges: Edge[] = skills
            .filter(s => s.parentId)
            .map(s => ({
                id: `e-${s.parentId}-${s.id}`,
                source: s.parentId!,
                target: s.id,
                type: 'smoothstep',
                animated: unlockedSkillIds.has(s.id),
                style: {
                    stroke: unlockedSkillIds.has(s.id) ? '#7c3aed' : '#333',
                    strokeWidth: 2,
                    opacity: unlockedSkillIds.has(s.id) ? 1 : 0.3
                }
            }));

        setNodes(newNodes);
        setEdges(newEdges);
    }, [skills, unlockedSkillIds, selectedSkill]);

    const onNodeClick = (_: any, node: Node) => {
        const skill = skills.find(s => s.id === node.id);
        if (skill) setSelectedSkill(skill);
    };

    const handleUnlock = async () => {
        if (!selectedSkill) return;

        if (currentSkillPoints < selectedSkill.cost) {
            toast.error(`Not enough skill points. Need ${selectedSkill.cost} SP`);
            return;
        }

        try {
            const res = await fetch('/api/loyalty/skills/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tenantId,
                    twitchUserId: userId,
                    skillNodeId: selectedSkill.id
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to unlock skill');
            }

            toast.success(`${selectedSkill.name} unlocked!`);
            setUnlockedSkillIds(prev => new Set(prev).add(selectedSkill.id));
            onSkillUnlock(selectedSkill.cost);
        } catch (err: any) {
            toast.error(err.message || 'Failed to unlock skill');
        }
    };

    return (
        <div className="flex gap-0 h-[700px]">
            <div className="flex-grow bg-slate-950/20 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    fitView
                    className="custom-scrollbar"
                >
                    <Background color="#1e1e2e" gap={20} size={1} />
                    <Controls className="!bg-black/50 !border-white/5 !fill-white" />
                </ReactFlow>
            </div>

            <div className="w-96 border-l border-white/5 bg-black/40 backdrop-blur-3xl p-8 overflow-y-auto custom-scrollbar">
                {selectedSkill ? (
                    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-brand-primary rounded-full shadow-[0_0_10px_rgba(124,58,237,0.5)]" />
                                <h3 className="text-2xl font-bold text-white uppercase italic tracking-tighter">{selectedSkill.name}</h3>
                            </div>
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest leading-relaxed opacity-70 italic">{selectedSkill.description}</p>
                        </div>

                        <div className="space-y-6">
                            <div className="p-6 rounded-[1.5rem] bg-white/[0.02] border border-white/5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Cost</span>
                                    <span className="text-lg font-bold text-brand-accent italic tracking-tighter">{selectedSkill.cost} SP</span>
                                </div>
                                <div className="h-0.5 w-full bg-white/[0.03] rounded-full" />
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">Effect</span>
                                    <span className="text-sm font-bold text-white uppercase tracking-widest">{selectedSkill.effectValue > 0 ? '+' : ''}{selectedSkill.effectValue * 100}% {selectedSkill.effectType}</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {unlockedSkillIds.has(selectedSkill.id) ? (
                                    <div className="w-full py-5 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary font-bold text-[10px] uppercase tracking-[0.4em] flex items-center justify-center gap-3 shadow-inner italic">
                                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                                        Unlocked
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleUnlock}
                                        disabled={selectedSkill.parentId !== null && !unlockedSkillIds.has(selectedSkill.parentId)}
                                        className="w-full py-5 rounded-2xl bg-brand-primary text-white font-bold text-[10px] uppercase tracking-[0.4em] hover:bg-white hover:text-brand-primary transition-all shadow-2xl shadow-brand-primary/20 flex items-center justify-center gap-3 active:scale-[0.98] border border-brand-primary/10 italic"
                                    >
                                        Unlock Skill
                                    </button>
                                )}

                                {selectedSkill.parentId !== null && !unlockedSkillIds.has(selectedSkill.parentId) && (
                                    <div className="flex items-center justify-center gap-3 text-rose-500/70">
                                        <div className="h-px flex-1 bg-rose-500/10" />
                                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] italic whitespace-nowrap">Unlock the parent skill first</p>
                                        <div className="h-px flex-1 bg-rose-500/10" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-6 opacity-30">
                        <div className="w-20 h-20 rounded-full border border-dashed border-white/20 flex items-center justify-center animate-spin-slow text-zinc-600">
                            <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M2 15c6.667-6 13.333 0 20-6"/><path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/><path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/><path d="m17 6-2.5-2.5"/><path d="m14 8-1-1"/><path d="m7 18 2.5 2.5"/><path d="m3.5 14.5.5.5"/><path d="m20 9 .5.5"/><path d="m6.5 17.5-1 1"/></svg>
                        </div>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.4em] italic">Select a skill to view details</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SkillTree;
