const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'OverlayWidget';
    `);
        console.log('Columns in OverlayWidget:');
        columns.forEach(c => console.log(' - ' + c.column_name));
    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
