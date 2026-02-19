
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // Adjust path if .env is in root
dotenv.config({ path: path.resolve(__dirname, '.env') }); // Try local .env too

const prisma = new PrismaClient();

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef', 'utf8');

console.log('DB URL:', process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@')); // Mask password

function decrypt(text: string): string {
    const [ivHex, encryptedText] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function main() {
    console.log('--- StreamElements Debugger ---');
    try {
        const tenants = await prisma.tenant.findMany();
        console.log(`Found ${tenants.length} tenants.`);

        for (const tenant of tenants) {
            console.log(`--- Tenant ID: ${tenant.id} ---`);
            const settings = (tenant.settings as any) || {};
            console.log('Settings:', JSON.stringify(settings, null, 2));

            const se = settings.streamelements;

            if (!se || !se.jwtToken) {
                console.log('StreamElements: Not connected.');
                continue;
            }

            console.log('StreamElements: Connected.');
            const token = decrypt(se.jwtToken);
            console.log(`Stored Channel ID: ${se.channelId}`);

            console.log('Fetching profile...');
            try {
                const profileRes = await axios.get('https://api.streamelements.com/kappa/v2/channels/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const realChannelId = profileRes.data._id;
                console.log(`Real Channel ID from API: ${realChannelId}`);
                console.log(`Profile Name: ${profileRes.data.username}`);

                console.log(`Fetching commands for ${realChannelId}...`);
                const res = await axios.get(`https://api.streamelements.com/kappa/v2/bot/commands/${realChannelId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                console.log('Response Status:', res.status);
                // ... log data ...
                if (Array.isArray(res.data)) {
                    console.log('Array Length:', res.data.length);
                } else {
                    console.log('Keys Length:', Object.keys(res.data).length);
                }
            } catch (e: any) {
                console.error('API Error:', e.message);
            }
        }
        return;

        /* Original single tenant logic removed */

    } catch (e) {
        console.error('Script Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
