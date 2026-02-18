
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const tenants = await prisma.tenant.findMany({
            include: {
                owner: {
                    select: {
                        username: true,
                        twitchId: true
                    }
                }
            }
        });

        console.log('\n--- Tenants ---');
        if (tenants.length === 0) {
            console.log('No tenants found.');
        }
        tenants.forEach(t => {
            console.log(`\nTenant Name: ${t.name}`);
            console.log(`Tenant ID: ${t.id}`);
            console.log(`Owner: ${t.owner.username} (Twitch ID: ${t.owner.twitchId})`);
        });
        console.log('\n---------------');

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
