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
            // Very basic layout logic for demo
            // Real app would use dagre or elkjs
            let x = 250;
            let y = 0;

            // Basic manual layout based on knowledge of tree structure or simple algorithm
            // Since we don't have dagre installed, we'll strive for a simple levels approach
            // Root at top
            if (!skill.parentId) {
                x = 250;
                y = 50;
            } else {
                // Find parent's position? N/A in this map loop easily without dependency order
                // Quick hack: hash ID to position or use predefined levels if depth is known
                // For this demo, let's just scatter them based on index to avoid overlap if parent logic fails
                y = (index + 1) * 100;
                x = (index % 2 === 0) ? 100 : 400; // Zigzag
            }

            // Override for specific demo nodes if they match IDs
            if (skill.id === 'root') { x = 250; y = 50; }
            if (skill.id === 'luck1') { x = 100; y = 200; }
            if (skill.id === 'xp1') { x = 400; y = 200; }
            if (skill.id === 'luck2') { x = 100; y = 350; }
            if (skill.id === 'heist1') { x = 400; y = 350; }


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
                    background: isUnlocked ? '#10b981' : (canUnlock ? '#f59e0b' : '#334155'),
                    color: '#fff',
                    border: selectedSkill?.id === skill.id ? '2px solid white' : '1px solid #777',
                    width: 150,
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
                style: { stroke: unlockedSkillIds.has(s.id) ? '#10b981' : '#555' }
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
            toast.error(`Not enough skill points! Need ${selectedSkill.cost}`);
            return;
        }

        try {
            const res = await fetch('http://localhost:3001/loyalty/skills/unlock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    twitchUserId: userId,
                    skillNodeId: selectedSkill.id
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Unlock failed');
            }

            toast.success(`Unlocked ${selectedSkill.name}!`);
            setUnlockedSkillIds(prev => new Set(prev).add(selectedSkill.id));
            onSkillUnlock(selectedSkill.cost);
        } catch (err: any) {
            toast.error(err.message || 'Failed to unlock skill');
        }
    };

    return (
        <div className="flex gap-4 h-[600px]">
            <div className="flex-grow border rounded-lg bg-slate-950 overflow-hidden">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    fitView
                >
                    <Background color="#333" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>

            <div className="w-80">
                {selectedSkill ? (
                    <Card className="bg-slate-900 border-slate-800 text-slate-100">
                        <CardHeader>
                            <CardTitle>{selectedSkill.name}</CardTitle>
                            <CardDescription className="text-slate-400">{selectedSkill.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span>Cost:</span>
                                <span className="font-bold text-yellow-500">{selectedSkill.cost} SP</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span>Effect:</span>
                                <span>{selectedSkill.effectValue > 0 ? '+' : ''}{selectedSkill.effectValue * 100}% {selectedSkill.effectType}</span>
                            </div>

                            {unlockedSkillIds.has(selectedSkill.id) ? (
                                <Button disabled className="w-full bg-green-900 text-green-300">Unlocked</Button>
                            ) : (
                                <Button
                                    onClick={handleUnlock}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                                    disabled={!selectedSkill.parentId || !unlockedSkillIds.has(selectedSkill.parentId)}
                                >
                                    Unlock Skill
                                </Button>
                            )}

                            {selectedSkill.parentId && !unlockedSkillIds.has(selectedSkill.parentId) && (
                                <p className="text-xs text-red-400 text-center">Requires previous skill</p>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="bg-slate-900 border-slate-800 text-slate-100 h-full flex items-center justify-center">
                        <p className="text-slate-500">Select a skill node</p>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default SkillTree;
