const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Synchronizes a predefined set of built-in commands into the database for the first tenant.
 *
 * Creates any missing built-in command records (marked as built-in and enabled) for the tenant, logs which commands were added or skipped, and disconnects the Prisma client when finished.
 */
async function syncCommands() {
    try {
        // Get the first tenant (your account)
        const tenant = await prisma.tenant.findFirst();

        if (!tenant) {
            console.log('❌ No tenant found. Please authenticate first.');
            return;
        }

        console.log(`✅ Found tenant: ${tenant.name}`);

        // Define all built-in commands
        const builtInCommands = [
            // Built-in utility commands
            { trigger: 'help', description: 'Show available commands' },
            { trigger: 'commands', description: 'Show available commands' },
            { trigger: 'ping', description: 'Test bot responsiveness' },
            { trigger: 'uptime', description: 'Show stream uptime' },
            { trigger: 'game', description: 'Show current game' },
            { trigger: 'title', description: 'Show stream title' },

            // Social commands
            { trigger: 'socials', description: 'Display social media links' },
            { trigger: 'shoutout', description: 'Give a shoutout to another streamer' },
            { trigger: 'so', description: 'Shoutout alias' },

            // Viewer stats commands
            { trigger: 'stats', description: 'Show viewer stats' },
            { trigger: 'xp', description: 'Show XP and level' },
            { trigger: 'top', description: 'Show top viewers' },
            { trigger: 'leaderboard', description: 'Show XP leaderboard' },
            { trigger: 'watchtime', description: 'Show watch time' },
            { trigger: 'followage', description: 'Show how long you\'ve been following' },

            // Battle system commands
            { trigger: 'battle', description: 'Challenge another viewer to a battle' },
            { trigger: 'accept', description: 'Accept a battle challenge' },
            { trigger: 'decline', description: 'Decline a battle challenge' },

            // Fun commands
            { trigger: '8ball', description: 'Ask the magic 8-ball' },
            { trigger: 'dadjoke', description: 'Get a random dad joke' },
            { trigger: 'fact', description: 'Get a random fact' },

            // Command management (mod only)
            { trigger: 'addcom', description: 'Add a custom command (mod only)' },
            { trigger: 'delcom', description: 'Delete a custom command (mod only)' },
            { trigger: 'editcom', description: 'Edit a custom command (mod only)' },
        ];

        let added = 0;
        let skipped = 0;

        for (const cmd of builtInCommands) {
            // Check if command already exists
            const existing = await prisma.command.findFirst({
                where: {
                    tenantId: tenant.id,
                    trigger: cmd.trigger,
                }
            });

            if (existing) {
                console.log(`⏭️  Skipped: !${cmd.trigger} (already exists)`);
                skipped++;
            } else {
                await prisma.command.create({
                    data: {
                        tenantId: tenant.id,
                        trigger: cmd.trigger,
                        responses: [],
                        isBuiltIn: true,
                        enabled: true,
                        description: cmd.description,
                    }
                });
                console.log(`✅ Added: !${cmd.trigger}`);
                added++;
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`   Added: ${added} commands`);
        console.log(`   Skipped: ${skipped} commands`);
        console.log(`\n✨ Done! Refresh your dashboard to see all commands.`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

syncCommands();