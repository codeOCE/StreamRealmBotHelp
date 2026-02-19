import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
    // 1. Get Tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.log('No tenant found.');
        return;
    }
    console.log(`Testing import for Tenant: ${tenant.id}`);

    // 2. Prepare Payload
    const payload = {
        commands: [
            {
                trigger: '!testimport1',
                responses: ['Hello form script'],
                enabled: true
            },
            {
                trigger: '!testimport2',
                responses: ['Another one'],
                enabled: true
            }
        ]
    };

    // 3. Needs Auth... this is hard to mimic via script without login.
    // However, I can manually invoke the Service directly to test the LOGIC.
    // Testing the Controller via HTTP requires a session cookie.

    // Let's test the SERVICE directly first to rule out logic errors.
    // If this works, then the Service is fine.

    console.log('--- Testing Service Logic via Direct DB Calls ---');
    try {
        // Mimic what the service does
        const result = await prisma.command.create({
            data: {
                tenantId: tenant.id,
                trigger: 'testimport1',
                responses: ['Hello from script'],
                enabled: true,
                isBuiltIn: false,
                isRegex: false
            }
        });
        console.log('Direct DB Create Success:', result.id);

        // Cleanup
        await prisma.command.delete({ where: { id: result.id } });
        console.log('Cleanup Success');

    } catch (e: any) {
        console.error('Direct DB Create Failed:', e.message);
    }
}

main();
