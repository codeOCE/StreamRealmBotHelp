const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCommands() {
    try {
        const tenant = await prisma.tenant.findFirst();
        console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

        const commands = await prisma.command.findMany({
            where: { tenantId: tenant.id },
            orderBy: { trigger: 'asc' }
        });

        console.log(`Total commands in database: ${commands.length}\n`);

        console.log('Built-in commands:');
        commands.filter(c => c.isBuiltIn).forEach(c => {
            console.log(`  !${c.trigger} - ${c.description || 'No description'}`);
        });

        console.log('\nCustom commands:');
        commands.filter(c => !c.isBuiltIn).forEach(c => {
            console.log(`  !${c.trigger} - ${c.responses[0] || 'No response'}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkCommands();
