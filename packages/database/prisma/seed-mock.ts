import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const MOCK_USER_ID = 'mock-user-id';
    const MOCK_TENANT_ID = 'hardcoded-tenant-id';

    console.log('--- Starting Mock Data Setup ---');

    // 1. Create User
    const user = await prisma.user.upsert({
        where: { id: MOCK_USER_ID },
        update: {},
        create: {
            id: MOCK_USER_ID,
            twitchId: '12345678',
            username: 'mockuser',
        },
    });
    console.log('✅ Mock User:', user.username);

    // 2. Create Tenant
    const tenant = await prisma.tenant.upsert({
        where: { id: MOCK_TENANT_ID },
        update: {},
        create: {
            id: MOCK_TENANT_ID,
            ownerId: MOCK_USER_ID,
            twitchId: '12345678',
            name: 'Mock Channel',
            isConnected: true,
        },
    });
    console.log('✅ Mock Tenant:', tenant.name);

    // 3. Create Default Moderation Rules
    const rules = [
        { type: 'CAPS', enabled: true, settings: { threshold: 0.7, duration: 600 } },
        { type: 'LINKS', enabled: true, settings: { duration: 300 } },
        { type: 'SPAM', enabled: true, settings: { threshold: 0.5, duration: 900 } },
        { type: 'SYMBOLS', enabled: true, settings: { threshold: 0.6, duration: 600 } },
        { type: 'EMOTES', enabled: true, settings: { threshold: 0.7, duration: 300 } },
        { type: 'BANNED_WORDS', enabled: true, settings: { duration: 3600, words: ['badword1'] } },
    ];

    for (const rule of rules) {
        await (prisma.modRule as any).upsert({
            where: { id: `rule-${rule.type}` },
            update: rule,
            create: {
                id: `rule-${rule.type}`,
                tenantId: MOCK_TENANT_ID,
                ...rule,
            },
        });
    }
    console.log('✅ Mock Moderation Rules created');

    // 4. Create Multi-response Commands
    const commands = [
        {
            trigger: 'hello',
            responses: ['Hello there!', 'Hi! How are you?', 'Greetings from the bot!'],
            cooldown: 30,
            userLevel: 'VIEWER' as any
        },
        {
            trigger: 'socials',
            responses: ['Follow us on Twitter!', 'Check out our Discord!'],
            cooldown: 10,
            userLevel: 'VIEWER' as any
        }
    ];

    for (const cmd of commands) {
        await (prisma.command as any).upsert({
            where: { tenantId_trigger: { tenantId: MOCK_TENANT_ID, trigger: cmd.trigger } },
            update: { responses: cmd.responses },
            create: {
                tenantId: MOCK_TENANT_ID,
                ...cmd
            }
        });
    }
    console.log('✅ Mock Multi-response Commands created');

    console.log('--- Mock Data Setup Complete ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
