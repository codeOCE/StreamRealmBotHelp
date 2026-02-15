const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.log('No tenant found. Run seed-advanced.js first.');
        return;
    }

    console.log(`Seeding analytics for tenant: ${tenant.name} (${tenant.id})`);

    // 1. Seed Audit Logs
    const auditActions = ['COMMAND_ADD', 'COMMAND_EDIT', 'TIMEOUT', 'BAN', 'DELETE'];
    const actors = ['theco', 'Sentinel', 'mod_shadow'];
    const targets = ['spammer123', '!stats', 'chat_bot'];

    for (let i = 0; i < 20; i++) {
        await prisma.auditLog.create({
            data: {
                tenantId: tenant.id,
                action: auditActions[Math.floor(Math.random() * auditActions.length)],
                actor: actors[Math.floor(Math.random() * actors.length)],
                target: targets[Math.floor(Math.random() * targets.length)],
                metadata: { info: "Seeded telemetry data", value: Math.random() },
                createdAt: new Date(Date.now() - Math.random() * 3600000)
            }
        });
    }

    // 2. Seed Chat Logs (for Trend Chart)
    for (let h = 0; h < 24; h++) {
        const count = Math.floor(Math.random() * 50 + 10);
        for (let j = 0; j < count; j++) {
            await prisma.chatLog.create({
                data: {
                    tenantId: tenant.id,
                    viewerId: 'seeded_user',
                    message: 'Seeded chat activity',
                    timestamp: new Date(new Date().setHours(h, Math.random() * 60))
                }
            });
        }
    }

    // 3. Update Command Usages
    const commands = await prisma.command.findMany({ where: { tenantId: tenant.id } });
    for (const cmd of commands) {
        await prisma.command.update({
            where: { id: cmd.id },
            data: { usages: Math.floor(Math.random() * 500) }
        });
    }

    // 4. Update Viewer XP
    const viewers = await prisma.viewerProfile.findMany({ where: { tenantId: tenant.id } });
    for (const viewer of viewers) {
        await prisma.viewerProfile.update({
            where: { id: viewer.id },
            data: {
                xp: Math.floor(Math.random() * 10000),
                level: Math.floor(Math.random() * 50) + 1
            }
        });
    }

    console.log('Seeding complete.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
