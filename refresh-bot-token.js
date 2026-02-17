const fs = require('fs');
const path = require('path');

/**
 * Refreshes the global bot token using the refresh token from .env
 * This is called automatically by BotManagerService when authentication fails
 */
async function refreshGlobalBotToken() {
    require('dotenv').config({ path: path.join(__dirname, 'apps', 'api', '.env') });

    const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
    const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GLOBAL_BOT_REFRESH_TOKEN;

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
        throw new Error('Missing required environment variables for token refresh');
    }

    console.log('🔄 Refreshing global bot token...');

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN
    });

    const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
        console.error('❌ Token refresh failed:', data);
        throw new Error(data.message || 'Token refresh failed');
    }

    console.log('✅ Token refreshed successfully!');

    // Update .env file
    const ENV_PATH = path.join(__dirname, 'apps', 'api', '.env');
    let envContent = fs.readFileSync(ENV_PATH, 'utf8');

    const tokenLine = `GLOBAL_BOT_TOKEN="${data.access_token}"`;
    const refreshLine = `GLOBAL_BOT_REFRESH_TOKEN="${data.refresh_token}"`;

    envContent = envContent.replace(/GLOBAL_BOT_TOKEN=.*/g, tokenLine);
    envContent = envContent.replace(/GLOBAL_BOT_REFRESH_TOKEN=.*/g, refreshLine);

    fs.writeFileSync(ENV_PATH, envContent);
    console.log('✅ Updated .env file with new tokens');

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token
    };
}

// Allow running standalone for testing
if (require.main === module) {
    refreshGlobalBotToken()
        .then(() => {
            console.log('\n✅ Token refresh complete!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Token refresh failed:', err.message);
            process.exit(1);
        });
}

module.exports = { refreshGlobalBotToken };
