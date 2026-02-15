const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany();
    const newDefaults = [
        { trigger: 'followage', responses: ['$(user), you have been following for $(followage)!'], responseType: 'SAY', isBuiltIn: true },
        { trigger: 'uptime', responses: ['$(channel) has been live for $(uptime)!'], responseType: 'SAY', isBuiltIn: true },
        { trigger: 'game', responses: ['Current Game: $(game)'], responseType: 'SAY', isBuiltIn: true },
        { trigger: 'title', responses: ['Stream Title: $(title)'], responseType: 'SAY', isBuiltIn: true },
        { trigger: 'shoutout', responses: [], isBuiltIn: true },
        { trigger: 'so', responses: [], isBuiltIn: true },
        { trigger: '8ball', responses: [], isBuiltIn: true },
        { trigger: 'dadjoke', responses: [], isBuiltIn: true },
        { trigger: 'fact', responses: [], isBuiltIn: true },
        { trigger: 'addcom', responses: [], isBuiltIn: true },
        { trigger: 'delcom', responses: [], isBuiltIn: true },
        { trigger: 'editcom', responses: [], isBuiltIn: true },
        { trigger: 'commands', responses: [], isBuiltIn: true },
        { trigger: 'xp', responses: [], isBuiltIn: true },
        { trigger: 'top', responses: [], isBuiltIn: true },
        { trigger: 'watchtime', responses: [], responseType: 'SAY', isBuiltIn: true },
        { trigger: 'socials', responses: ['Stay connected! Follow us on Twitter and Instagram @StreamRealm_Mock'], responseType: 'SAY', isBuiltIn: true },
    ];

    for (const tenant of tenants) {
        process.stdout.write(`Seeding tenant: ${tenant.name}... `);
        for (const cmd of newDefaults) {
            await prisma.command.upsert({
                where: {
                    tenantId_trigger: {
                        tenantId: tenant.id,
                        trigger: cmd.trigger,
                    },
                },
                update: { isBuiltIn: true, enabled: true },
                create: {
                    tenantId: tenant.id,
                    trigger: cmd.trigger,
                    responses: cmd.responses,
                    responseType: cmd.responseType || 'SAY',
                    isBuiltIn: cmd.isBuiltIn,
                    enabled: true,
                    userLevel: 'VIEWER',
                },
            });
        }
        process.stdout.write("Done\n");
    }
    await prisma.$disconnect();
}

main().catch(console.error);
