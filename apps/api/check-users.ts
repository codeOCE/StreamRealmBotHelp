
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to database...');
    const users = await prisma.user.findMany({
        include: {
            tenants: {
                select: {
                    name: true,
                    twitchId: true
                }
            }
        }
    });

    let output = '---------------------------------------------------\n';
    output += `Found ${users.length} users.\n`;
    output += '---------------------------------------------------\n';

    if (users.length > 0) {
        users.forEach(user => {
            const tenants = user.tenants.map(t => `${t.name} (TwitchID: ${t.twitchId})`).join(', ');
            output += `[ID: ${user.id}] ${user.username} (TwitchID: ${user.twitchId}) - Tenants: ${tenants || 'None'}\n`;
        });
    } else {
        output += 'No users found.\n';
    }

    fs.writeFileSync('users.txt', output);
    console.log('Output written to users.txt');
}

main()
    .catch(e => {
        console.error('Error querying database:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
