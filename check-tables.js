const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
        console.log('Tables in DB:', tables.map(t => t.table_name));
        const integrationTable = tables.find(t => t.table_name === 'Integration');
        if (integrationTable) {
            console.log('SUCCESS: Integration table found.');
        } else {
            console.log('FAILURE: Integration table NOT found.');
        }
    } catch (err) {
        console.error('Error checking tables:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
