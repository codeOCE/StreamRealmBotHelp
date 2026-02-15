const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenants = await prisma.tenant.findMany({
        include: {
            commands: true
        }
    });

    console.log('--- TENANTS ---');
    tenants.forEach(t => {
        console.log(`- ${t.name} (ID: ${t.id}, TwitchId: ${t.twitchId}, Target: ${t.targetChannel})`);
        console.log(`  Commands: ${t.commands.length}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
