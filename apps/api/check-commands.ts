import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.log("No tenant found.");
            return;
        }

        console.log(`Checking commands for tenant: ${tenant.id}`);

        const commands = await prisma.command.findMany({
            where: { tenantId: tenant.id }
        });

        console.log(`Found ${commands.length} commands.`);
        commands.forEach(c => {
            console.log(`- !${c.trigger} (BuiltIn: ${c.isBuiltIn})`);
        });

    } catch (e: any) {
        console.log("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
