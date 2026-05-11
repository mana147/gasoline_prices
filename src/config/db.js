const ms_sql = require('mssql');
const sqlite3 = require('sqlite3').verbose();

const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || './database/fuel_data.db';

const mssqlConfig = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

const sqlite_db = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
    if (err) {
        console.error('> ERROR: Could not connect to SQLite database:', err.message);
        return;
    }
    console.log('> LOG: Connected to SQLite database -' + SQLITE_DB_PATH);
    sqlite_db.serialize(() => {
        sqlite_db.run(`
            CREATE TABLE IF NOT EXISTS zkteco_devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                ip TEXT NOT NULL,
                port INTEGER DEFAULT 4370,
                timeout INTEGER DEFAULT 5000,
                location TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT,
                updated_at TEXT
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create zkteco_devices table:', e.message);
            else console.log('> LOG: Table zkteco_devices ready');
        });

        sqlite_db.run(`
            CREATE TABLE IF NOT EXISTS zkteco_employees (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL,
                uid       INTEGER NOT NULL,
                user_id   TEXT NOT NULL DEFAULT '',
                name      TEXT NOT NULL DEFAULT '',
                role      INTEGER DEFAULT 0,
                password  TEXT DEFAULT '',
                cardno    INTEGER DEFAULT 0,
                synced_at TEXT NOT NULL,
                UNIQUE(device_id, uid)
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create zkteco_employees table:', e.message);
            else console.log('> LOG: Table zkteco_employees ready');
        });
    });
});

async function connectMSSQL() {
    try {
        const pool = await ms_sql.connect(mssqlConfig);
        if (pool.connected) console.log('> LOG: Connected to SQL Server -', mssqlConfig.server);
        else console.log('> LOG: Failed to connect to SQL Server -', mssqlConfig.server);
    } catch (err) {
        console.error('> ERROR: Database connection failed: ', err.message);
    }
}

const WIFI_DB_PATH = process.env.WIFI_DB_PATH || './database/wifi_moni.db';

const sqlite_wifi_db = new sqlite3.Database(WIFI_DB_PATH, (err) => {
    if (err) {
        console.error('> ERROR: Could not connect to WiFi database:', err.message);
        return;
    }
    console.log('> LOG: Connected to WiFi database -' + WIFI_DB_PATH);
    sqlite_wifi_db.serialize(() => {
        sqlite_wifi_db.run(`
            CREATE TABLE IF NOT EXISTS wifi_aps (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             TEXT NOT NULL,
                ip               TEXT NOT NULL,
                location         TEXT,
                snmp_community   TEXT DEFAULT 'public',
                snmp_client_oid  TEXT,
                status           TEXT DEFAULT 'active',
                last_status      TEXT DEFAULT 'unknown',
                last_ping_ms     INTEGER,
                last_clients     INTEGER,
                last_uptime_sec  INTEGER,
                last_checked_at  TEXT,
                created_at       TEXT,
                updated_at       TEXT
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create wifi_aps table:', e.message);
            else console.log('> LOG: Table wifi_aps ready');
        });

        sqlite_wifi_db.run(`
            CREATE TABLE IF NOT EXISTS wifi_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ap_id       INTEGER NOT NULL,
                event_type  TEXT NOT NULL,
                ping_ms     INTEGER,
                checked_at  TEXT NOT NULL
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create wifi_events table:', e.message);
            else console.log('> LOG: Table wifi_events ready');
        });
    });
});

const WINDOWS_DB_PATH = process.env.WINDOWS_DB_PATH || './database/windows_moni.db';

const sqlite_windows_db = new sqlite3.Database(WINDOWS_DB_PATH, (err) => {
    if (err) {
        console.error('> ERROR: Could not connect to Windows monitoring database:', err.message);
        return;
    }
    console.log('> LOG: Connected to Windows monitoring database -' + WINDOWS_DB_PATH);
    sqlite_windows_db.serialize(() => {
        sqlite_windows_db.run(`
            CREATE TABLE IF NOT EXISTS windows_servers (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT    NOT NULL,
                host            TEXT    NOT NULL,
                port            INTEGER DEFAULT 22,
                username        TEXT    NOT NULL,
                password        TEXT    NOT NULL,
                location        TEXT,
                status          TEXT    DEFAULT 'active',
                last_status     TEXT    DEFAULT 'unknown',
                last_cpu_pct    REAL,
                last_ram_pct    REAL,
                last_disk_json  TEXT,
                last_error      TEXT,
                last_checked_at TEXT,
                created_at      TEXT,
                updated_at      TEXT
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create windows_servers table:', e.message);
            else console.log('> LOG: Table windows_servers ready');
        });

        sqlite_windows_db.run(`
            CREATE TABLE IF NOT EXISTS windows_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id   INTEGER NOT NULL,
                event_type  TEXT    NOT NULL,
                message     TEXT,
                cpu_pct     REAL,
                ram_pct     REAL,
                checked_at  TEXT    NOT NULL,
                FOREIGN KEY (server_id) REFERENCES windows_servers(id) ON DELETE CASCADE
            )
        `, (e) => {
            if (e) console.error('> ERROR: Could not create windows_events table:', e.message);
            else console.log('> LOG: Table windows_events ready');
        });
    });
});

module.exports = { sqlite_db, sqlite_wifi_db, sqlite_windows_db, mssqlConfig, connectMSSQL };
