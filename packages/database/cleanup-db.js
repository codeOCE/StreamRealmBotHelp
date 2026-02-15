const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
    console.log('--- DB MERGE START ---');
    const tenants = await prisma.tenant.findMany();
    const hardcoded = tenants.find(t => t.id === 'hardcoded-tenant-id');
    const actual = tenants.find(t => t.id !== 'hardcoded-tenant-id' && t.name === 'codeoce');

    if (hardcoded && actual) {
        console.log(`Clearing commands for actual tenant ${actual.id}...`);
        await prisma.command.deleteMany({ where: { tenantId: actual.id } });

        console.log(`Merging commands from ${hardcoded.id} to ${actual.id}`);
        const result = await prisma.command.updateMany({
            where: { tenantId: hardcoded.id },
            data: { tenantId: actual.id }
        });
        console.log(`Moved ${result.count} commands.`);

        console.log(`Deleting redundant hardcoded tenant...`);
        // We might need to delete other relations if they exist, but commands are moved.
        // ChatLogs, EventLogs, etc. should probably be moved too or deleted.
        await prisma.chatLog.deleteMany({ where: { tenantId: hardcoded.id } });
        await prisma.eventLog.deleteMany({ where: { tenantId: hardcoded.id } });
        await prisma.modRule.deleteMany({ where: { tenantId: hardcoded.id } });
        await prisma.viewerProfile.deleteMany({ where: { tenantId: hardcoded.id } });
        await prisma.timer.deleteMany({ where: { tenantId: hardcoded.id } });

        await prisma.tenant.delete({ where: { id: hardcoded.id } });
        console.log('Done.');
    } else {
        console.warn('Could not find both tenants. Check IDs.');
        console.log('Tenants:', tenants.map(t => ({ id: t.id, name: t.name, twitchId: t.twitchId })));
    }
}

cleanup().finally(() => prisma.$disconnect());
