function insert(db, { ap_id, event_type, ping_ms }) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO wifi_events (ap_id, event_type, ping_ms, checked_at)
             VALUES (?, ?, ?, ?)`,
            [ap_id, event_type, ping_ms ?? null, new Date().toISOString()],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function getByApId(db, ap_id, limit = 50) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT * FROM wifi_events WHERE ap_id = ? ORDER BY checked_at DESC LIMIT ?`,
            [ap_id, limit],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });
}

module.exports = { insert, getByApId };
