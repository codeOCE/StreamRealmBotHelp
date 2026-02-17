require('dotenv').config({ path: 'apps/api/.env' });

// Get token from .env file
let token = process.env.GLOBAL_BOT_TOKEN;

// Remove oauth: prefix if it exists
if (token && token.startsWith('oauth:')) {
    token = token.substring(6);
}

console.log('\n===========================================');
console.log('   TWITCH TOKEN VALIDATOR');
console.log('===========================================\n');

if (!token) {
    console.error('❌ ERROR: GLOBAL_BOT_TOKEN not found in .env file!');
    console.log('\nPlease make sure your apps/api/.env file has:');
    console.log('GLOBAL_BOT_TOKEN="your_token_here"\n');
    process.exit(1);
}

console.log(`✅ Token found (first 10 chars): ${token.substring(0, 10)}...\n`);
console.log('Validating token with Twitch...\n');

fetch('https://id.twitch.tv/oauth2/validate', {
    headers: {
        'Authorization': `OAuth ${token}`
    }
})
    .then(r => {
        if (!r.ok) {
            throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
    })
    .then(data => {
        console.log('✅ TOKEN IS VALID!\n');
        console.log('📋 Token Details:');
        console.log('─────────────────────────────────────────');
        console.log(`   User ID:    ${data.user_id}`);
        console.log(`   Login:      ${data.login}`);
        console.log(`   Client ID:  ${data.client_id}`);
        console.log(`   Expires:    ${data.expires_in ? `${Math.floor(data.expires_in / 86400)} days` : 'Never'}`);
        console.log('─────────────────────────────────────────\n');

        console.log('🔐 Scopes Granted:');
        console.log('─────────────────────────────────────────');
        if (data.scopes && data.scopes.length > 0) {
            data.scopes.forEach(scope => {
                console.log(`   ✓ ${scope}`);
            });
        } else {
            console.log('   ⚠️  No scopes found!');
        }
        console.log('─────────────────────────────────────────\n');

        // Check for required bot badge scopes
        console.log('🎖️  Bot Badge Requirements:');
        console.log('─────────────────────────────────────────');
        const requiredScopes = [
            'user:bot',
            'channel:bot',
            'user:write:chat',
            'chat:read',
            'chat:edit'
        ];

        let allPresent = true;
        requiredScopes.forEach(required => {
            const hasScope = data.scopes && data.scopes.includes(required);
            if (hasScope) {
                console.log(`   ✅ ${required}`);
            } else {
                console.log(`   ❌ ${required} - MISSING!`);
                allPresent = false;
            }
        });
        console.log('─────────────────────────────────────────\n');

        if (allPresent) {
            console.log('🎉 SUCCESS! Your token has all required scopes for the bot badge!\n');
        } else {
            console.log('⚠️  WARNING: Missing required scopes!');
            console.log('   You need to regenerate your token with all scopes.\n');
            console.log('   Run: node generate-token.js\n');
        }
    })
    .catch(err => {
        console.error('❌ TOKEN VALIDATION FAILED!\n');
        console.error('Error:', err.message);
        console.log('\nPossible issues:');
        console.log('  1. Token is invalid or expired');
        console.log('  2. Token was revoked');
        console.log('  3. Network connection issue');
        console.log('\nSolution: Generate a new token');
        console.log('  Run: node generate-token.js\n');
        process.exit(1);
    });