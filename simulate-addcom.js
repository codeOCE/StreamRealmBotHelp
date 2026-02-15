const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find the current tenant
    const tenant = await prisma.tenant.findFirst({
        where: { name: 'codeoce' }
    });

    if (!tenant) {
        console.error('Tenant not found');
        return;
    }

    console.log(`Adding command for tenant: ${tenant.name} (${tenant.id})`);

    const newTrigger = 'testcommand';
    const newResponse = 'This is a test response';

    const cmd = await prisma.command.create({
        data: {
            tenantId: tenant.id,
            trigger: newTrigger,
            responses: [newResponse],
            enabled: true,
            isBuiltIn: false,
            userLevel: 'VIEWER'
        }
    });

    console.log('Command created:', cmd);

    // Check if it's in the DB
    const found = await prisma.command.findFirst({
        where: { tenantId: tenant.id, trigger: newTrigger }
    });
    console.log('Verification found:', found ? 'YES' : 'NO');
}

main().catch(console.error).finally(() => prisma.$disconnect());
