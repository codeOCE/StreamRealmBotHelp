
const http = require('http');

http.get('http://localhost:3001/commands', (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const commands = JSON.parse(data);
            const invalid = commands.filter(c => c.trigger === '!undefined');
            console.log(`Found ${invalid.length} invalid commands.`);
            if (invalid.length > 0) {
                console.log('IDs:', invalid.map(c => c.id));
            }
        } catch (e) {
            console.error(e.message);
        }
    });
}).on('error', (err) => {
    console.error('Error: ' + err.message);
});
