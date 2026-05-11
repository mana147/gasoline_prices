function insert(db, { server_id, event_type, message, cpu_pct, ram_pct }) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO windows_events (server_id, event_type, message, cpu_pct, ram_pct, checked_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [server_id, event_type, message ?? null, cpu_pct ?? null, ram_pct ?? null, new Date().toISOString()],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
}

function getByServerId(db, server_id, limit = 50) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM windows_events WHERE server_id = ? ORDER BY checked_at DESC LIMIT ?`,
            [server_id, limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

module.exports = { insert, getByServerId };
