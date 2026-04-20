require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ZKLib = require('zkteco-js');

const ip = process.argv[2] || '172.16.9.14';
const port = parseInt(process.argv[3] || '4370');

async function main() {
    console.log(`Connecting to ZKTeco device at ${ip}:${port}...`);
    const device = new ZKLib(ip, port, 5000, 5200);
    try {
        await device.createSocket();
        console.log('Connected.\n');

        const result = await device.getUsers();
        const users = result.data || [];

        console.log(`Total users: ${users.length}\n`);
        console.log('Raw data:');
        console.log(JSON.stringify(users, null, 2));

        if (users.length > 0) {
            console.log('\nField summary (first user):');
            const sample = users[0];
            for (const [key, val] of Object.entries(sample)) {
                console.log(`  ${key}: ${JSON.stringify(val)} (${typeof val})`);
            }
        }
    } finally {
        await device.disconnect();
        console.log('\nDisconnected.');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
