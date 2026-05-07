function getAll(db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM wifi_aps ORDER BY name ASC`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getById(db, id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM wifi_aps WHERE id = ?`, [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function insert(db, { name, ip, location, snmp_community, snmp_client_oid }) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO wifi_aps (name, ip, location, snmp_community, snmp_client_oid, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
            [name, ip, location || null, snmp_community || 'public', snmp_client_oid || null, now, now],
            function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

function update(db, id, { name, ip, location, snmp_community, snmp_client_oid, status }) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE wifi_aps
             SET name            = COALESCE(?, name),
                 ip              = COALESCE(?, ip),
                 location        = COALESCE(?, location),
                 snmp_community  = COALESCE(?, snmp_community),
                 snmp_client_oid = ?,
                 status          = COALESCE(?, status),
                 updated_at      = ?
             WHERE id = ?`,
            [name, ip, location, snmp_community, snmp_client_oid ?? null, status, new Date().toISOString(), id],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

function remove(db, id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM wifi_aps WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function updateStatus(db, id, { last_status, last_ping_ms, last_clients, last_uptime_sec }) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE wifi_aps
             SET last_status      = ?,
                 last_ping_ms     = ?,
                 last_clients     = ?,
                 last_uptime_sec  = ?,
                 last_checked_at  = ?
             WHERE id = ?`,
            [last_status, last_ping_ms ?? null, last_clients ?? null, last_uptime_sec ?? null,
             new Date().toISOString(), id],
            function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            }
        );
    });
}

module.exports = { getAll, getById, insert, update, remove, updateStatus };
