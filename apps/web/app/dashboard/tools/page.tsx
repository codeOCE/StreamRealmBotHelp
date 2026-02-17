import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CommandTester } from "@/components/dashboard/CommandTester";

/**
 * Render the Tools & Utilities dashboard page with a Command Simulator tab.
 *
 * The page displays a header and a single-tab interface containing a sandboxed
 * Command Simulator card; side effects such as API calls may run but no messages
 * will be sent to Twitch.
 *
 * @returns The React element containing the page layout (header, tabs, and CommandTester card).
 */
export default function ToolsPage() {
    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white uppercase">Tools & Utilities</h1>
                <p className="text-zinc-500 text-sm font-bold tracking-wide mt-2">
                    Advanced tools for debugging and managing your stream bot.
                </p>
            </div>

            <Tabs defaultValue="simulator" className="w-full">
                <TabsList className="grid w-full grid-cols-1 lg:w-[200px]">
                    <TabsTrigger value="simulator">Command Simulator</TabsTrigger>
                </TabsList>
                <TabsContent value="simulator" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Command Simulator</CardTitle>
                            <CardDescription>
                                Test your commands in a sandbox environment. Side effects (like API calls) WILL be executed, but no messages will be sent to Twitch.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CommandTester />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}