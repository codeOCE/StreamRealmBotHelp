import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Checking Prisma Client...");
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) {
            console.log("No tenant found, can't test.");
            return;
        }

        console.log(`Testing with tenant: ${tenant.id}`);

        await prisma.command.create({
            data: {
                tenantId: tenant.id,
                trigger: '!testdbupdate',
                responses: JSON.stringify(['test']),
                userCooldown: 10,
                isRegex: false
            }
        });
        console.log("Success: userCooldown accepted.");

        // Cleanup
        await prisma.command.deleteMany({ where: { trigger: '!testdbupdate' } });

    } catch (e: any) {
        console.log("Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
