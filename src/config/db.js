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

module.exports = { sqlite_db, mssqlConfig, connectMSSQL };
