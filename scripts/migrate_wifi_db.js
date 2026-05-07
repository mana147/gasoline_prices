// scripts/migrate_wifi_db.js
// Chạy 1 lần: copy wifi_aps + wifi_events từ fuel_data.db → wifi_moni.db
// Usage: node scripts/migrate_wifi_db.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sqlite3 = require('sqlite3').verbose();

const SRC_PATH  = process.env.SQLITE_DB_PATH || './database/fuel_data.db';
const DEST_PATH = process.env.WIFI_DB_PATH   || './database/wifi_moni.db';

const src  = new sqlite3.Database(SRC_PATH);
const dest = new sqlite3.Database(DEST_PATH);

const run = (db, sql, params = []) =>
    new Promise((resolve, reject) =>
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

const all = (db, sql) =>
    new Promise((resolve, reject) =>
        db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows)));

async function migrate() {
    console.log(`\nSRC : ${SRC_PATH}`);
    console.log(`DEST: ${DEST_PATH}\n`);

    const aps    = await all(src, 'SELECT * FROM wifi_aps');
    const events = await all(src, 'SELECT * FROM wifi_events');
    console.log(`Found in SRC: ${aps.length} APs, ${events.length} events`);

    if (!aps.length && !events.length) {
        console.log('Nothing to migrate. Exiting.');
        src.close(); dest.close(); return;
    }

    // Migrate APs — giữ nguyên id (INSERT OR IGNORE tránh duplicate khi chạy lại)
    for (const ap of aps) {
        await run(dest,
            `INSERT OR IGNORE INTO wifi_aps
             (id,name,ip,location,snmp_community,snmp_client_oid,status,
              last_status,last_ping_ms,last_clients,last_uptime_sec,last_checked_at,
              created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ap.id, ap.name, ap.ip, ap.location, ap.snmp_community, ap.snmp_client_oid,
             ap.status, ap.last_status, ap.last_ping_ms, ap.last_clients,
             ap.last_uptime_sec, ap.last_checked_at, ap.created_at, ap.updated_at]
        );
        console.log(`  AP migrated: [${ap.id}] ${ap.name} (${ap.ip})`);
    }

    // Migrate events — giữ nguyên id
    for (const ev of events) {
        await run(dest,
            `INSERT OR IGNORE INTO wifi_events (id,ap_id,event_type,ping_ms,checked_at)
             VALUES (?,?,?,?,?)`,
            [ev.id, ev.ap_id, ev.event_type, ev.ping_ms, ev.checked_at]
        );
    }
    console.log(`  Events migrated: ${events.length}`);

    // Drop old tables từ fuel_data.db
    await run(src, 'DROP TABLE IF EXISTS wifi_events');
    await run(src, 'DROP TABLE IF EXISTS wifi_aps');
    console.log('\n  Dropped wifi_aps + wifi_events from fuel_data.db');

    // Verify
    const [ac] = await all(dest, 'SELECT COUNT(*) as c FROM wifi_aps');
    const [ec] = await all(dest, 'SELECT COUNT(*) as c FROM wifi_events');
    console.log(`\nResult in wifi_moni.db: ${ac.c} APs, ${ec.c} events`);
    console.log('Migration complete.\n');

    src.close(); dest.close();
}

migrate().catch(e => { console.error(e); process.exit(1); });
