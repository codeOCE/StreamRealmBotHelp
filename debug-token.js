require('dotenv').config({ path: './apps/api/.env' });

console.log('\n🔍 Token Configuration Debug\n');
console.log('─────────────────────────────────────────');

const botUsername = process.env.GLOBAL_BOT_USERNAME;
const botToken = process.env.GLOBAL_BOT_TOKEN;

console.log('Bot Username:', botUsername || '❌ NOT SET');
console.log('Bot Token:', botToken ? `${botToken.substring(0, 15)}... (${botToken.length} chars)` : '❌ NOT SET');

if (!botToken) {
    console.log('\n❌ GLOBAL_BOT_TOKEN is not set in .env!');
    process.exit(1);
}

// Check if token starts with oauth:
if (botToken.startsWith('oauth:')) {
    console.log('\n⚠️  WARNING: Token has "oauth:" prefix!');
    console.log('   Remove it from .env file. The code adds it automatically.');
    console.log('   Current:', `oauth:${botToken.substring(6, 20)}...`);
    console.log('   Should be:', `${botToken.substring(6, 20)}...`);
}

// Validate the token with Twitch
console.log('\n🔄 Validating token with Twitch API...\n');

const tokenToValidate = botToken.startsWith('oauth:') ? botToken.substring(6) : botToken;

fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
        'Authorization': `OAuth ${tokenToValidate}`
    }
})
    .then(r => r.json())
    .then(data => {
        if (data.client_id) {
            console.log('✅ Token is valid!');
            console.log('   User ID:', data.user_id);
            console.log('   Login:', data.login);
            console.log('   Client ID:', data.client_id);
            console.log('\n🔐 Token Scopes:');
            data.scopes.forEach(scope => console.log(`   ✓ ${scope}`));

            // Check if this matches bot username
            if (botUsername && data.login.toLowerCase() !== botUsername.toLowerCase()) {
                console.log('\n⚠️  WARNING: Token login does not match GLOBAL_BOT_USERNAME!');
                console.log(`   .env says: ${botUsername}`);
                console.log(`   Token is for: ${data.login}`);
                console.log(`\n   Fix: Update GLOBAL_BOT_USERNAME to "${data.login}"`);
            }
        } else {
            console.log('❌ Token validation failed!');
            console.log(data);
        }
    })
    .catch(err => {
        console.log('❌ Failed to validate token:', err.message);
    });