const { PrismaClient } = require('@stream-realm/database');
const prisma = new PrismaClient();

/**
 * Update tenant with twitchId '96085876' to set its botUsername to 'streamrealmbot'.
 *
 * Ensures the Prisma client is disconnected when finished and logs success or error information to the console.
 */
async function updateTenant() {
    console.log('>> Updating Tenant 96085876...');

    try {
        const update = await prisma.tenant.update({
            where: {
                twitchId: '96085876'
            },
            data: {
                botUsername: 'streamrealmbot'
            }
        });

        console.log('>> SUCCESS: Tenant updated.');
        console.log(update);

    } catch (err) {
        console.error('>> ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

updateTenant();