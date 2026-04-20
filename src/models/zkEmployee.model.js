function getAllByDevice(db, deviceId) {
    return new Promise((resolve, reject) => {
        db.all(
            'SELECT * FROM zkteco_employees WHERE device_id = ? ORDER BY uid ASC',
            [deviceId],
            (err, rows) => { if (err) reject(err); else resolve(rows); }
        );
    });
}

function upsertMany(db, deviceId, users) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        const stmt = db.prepare(`
            INSERT INTO zkteco_employees (device_id, uid, user_id, name, role, password, cardno, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id, uid) DO UPDATE SET
                user_id   = excluded.user_id,
                name      = excluded.name,
                role      = excluded.role,
                password  = excluded.password,
                cardno    = excluded.cardno,
                synced_at = excluded.synced_at
        `);

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            let error = null;
            for (const u of users) {
                stmt.run(
                    [deviceId, u.uid, u.userId || '', u.name || '', u.role || 0, u.password || '', u.cardno || 0, now],
                    (e) => { if (e) error = e; }
                );
            }
            stmt.finalize((e) => {
                if (e || error) {
                    db.run('ROLLBACK');
                    reject(e || error);
                } else {
                    db.run('COMMIT', (ce) => { if (ce) reject(ce); else resolve(); });
                }
            });
        });
    });
}

function insert(db, deviceId, employee) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO zkteco_employees (device_id, uid, user_id, name, role, password, cardno, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(device_id, uid) DO UPDATE SET
                user_id   = excluded.user_id,
                name      = excluded.name,
                role      = excluded.role,
                password  = excluded.password,
                cardno    = excluded.cardno,
                synced_at = excluded.synced_at`,
            [deviceId, employee.uid, employee.userId || '', employee.name || '', employee.role || 0, employee.password || '', employee.cardno || 0, now],
            function (err) { if (err) reject(err); else resolve(this.lastID); }
        );
    });
}

function deleteOne(db, deviceId, uid) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM zkteco_employees WHERE device_id = ? AND uid = ?',
            [deviceId, uid],
            function (err) { if (err) reject(err); else resolve(this.changes); }
        );
    });
}

function deleteAllByDevice(db, deviceId) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM zkteco_employees WHERE device_id = ?',
            [deviceId],
            function (err) { if (err) reject(err); else resolve(this.changes); }
        );
    });
}

module.exports = { getAllByDevice, upsertMany, insert, deleteOne, deleteAllByDevice };
