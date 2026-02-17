const { PrismaClient } = require('@stream-realm/database');
const prisma = new PrismaClient();

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
