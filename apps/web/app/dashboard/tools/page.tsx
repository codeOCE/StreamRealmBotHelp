"use client";

import { Hash, Quote, Terminal, Wrench } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandTester } from "@/components/dashboard/CommandTester";
import { CountersManager } from "@/components/dashboard/CountersManager";
import { QuotesManager } from "@/components/dashboard/QuotesManager";
import { FeatureHeader, FeaturePage, Panel } from "@/components/dashboard/FeatureUI";

export default function ToolsPage() {
    return (
        <FeaturePage>
            <FeatureHeader
                icon={Wrench}
                title="Tools"
                subtitle="Test commands, manage counters, and curate your quote wall — all without leaving the dashboard."
            />

            <Tabs defaultValue="simulator" className="w-full">
                <TabsList className="bg-white/[0.02] p-1 rounded-xl border border-white/[0.06] mb-6">
                    <TabsTrigger value="simulator" className="dashboard-tab-btn data-[state=active]:active gap-2">
                        <Terminal className="w-3.5 h-3.5" />
                        Command Simulator
                    </TabsTrigger>
                    <TabsTrigger value="counters" className="dashboard-tab-btn data-[state=active]:active gap-2">
                        <Hash className="w-3.5 h-3.5" />
                        Counters
                    </TabsTrigger>
                    <TabsTrigger value="quotes" className="dashboard-tab-btn data-[state=active]:active gap-2">
                        <Quote className="w-3.5 h-3.5" />
                        Quotes
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="simulator" className="mt-0 focus-visible:outline-none">
                    <Panel title="Command Simulator">
                        <p className="text-brand-muted text-sm font-medium leading-relaxed max-w-2xl mb-8">
                            Test commands as if they were sent in chat. API side effects will run, but no messages will be sent publicly.
                        </p>
                        <div className="p-6 sm:p-8 rounded-2xl bg-black/30 border border-white/[0.06]">
                            <CommandTester />
                        </div>
                    </Panel>
                </TabsContent>

                <TabsContent value="counters" className="mt-0 focus-visible:outline-none">
                    <Panel title="Counters">
                        <CountersManager />
                    </Panel>
                </TabsContent>

                <TabsContent value="quotes" className="mt-0 focus-visible:outline-none">
                    <Panel title="Quotes">
                        <QuotesManager />
                    </Panel>
                </TabsContent>
            </Tabs>
        </FeaturePage>
    );
}
