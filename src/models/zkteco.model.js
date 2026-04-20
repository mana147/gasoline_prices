function getAllDevices(db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM zkteco_devices ORDER BY created_at DESC`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getDeviceById(db, id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM zkteco_devices WHERE id = ?`, [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function createDevice(db, { name, ip, port, timeout, location }) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO zkteco_devices (name, ip, port, timeout, location, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
            [name, ip, port || 4370, timeout || 5000, location || null, now, now],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function updateDevice(db, id, { name, ip, port, timeout, location, status }) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE zkteco_devices
             SET name = COALESCE(?, name),
                 ip = COALESCE(?, ip),
                 port = COALESCE(?, port),
                 timeout = COALESCE(?, timeout),
                 location = COALESCE(?, location),
                 status = COALESCE(?, status),
                 updated_at = ?
             WHERE id = ?`,
            [name, ip, port, timeout, location, status, new Date().toISOString(), id],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

function deleteDevice(db, id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM zkteco_devices WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

module.exports = { getAllDevices, getDeviceById, createDevice, updateDevice, deleteDevice };
