const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findGreetings() {
    try {
        const tenant = await prisma.tenant.findFirst();
        console.log(`Searching in tenant: ${tenant.name}\n`);

        // Search for greetings specifically
        const greetingsCmd = await prisma.command.findFirst({
            where: {
                tenantId: tenant.id,
                OR: [
                    { trigger: 'greetings' },
                    { aliases: { path: [], array_contains: 'greetings' } }
                ]
            }
        });

        if (greetingsCmd) {
            console.log('✅ Found !greetings command:');
            console.log(`   ID: ${greetingsCmd.id}`);
            console.log(`   Trigger: !${greetingsCmd.trigger}`);
            console.log(`   Aliases: ${JSON.stringify(greetingsCmd.aliases)}`);
            console.log(`   Responses: ${JSON.stringify(greetingsCmd.responses)}`);
            console.log(`   Built-in: ${greetingsCmd.isBuiltIn}`);
            console.log(`   Enabled: ${greetingsCmd.enabled}`);
        } else {
            console.log('❌ !greetings command NOT found in database');
            console.log('\nLet me show you ALL commands with aliases:\n');

            const allCommands = await prisma.command.findMany({
                where: { tenantId: tenant.id }
            });

            allCommands.forEach(cmd => {
                if (cmd.aliases && cmd.aliases.length > 0) {
                    console.log(`!${cmd.trigger} - Aliases: ${JSON.stringify(cmd.aliases)}`);
                }
            });
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

findGreetings();
