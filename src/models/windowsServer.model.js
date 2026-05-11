function getAll(db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM windows_servers ORDER BY name ASC`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getById(db, id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM windows_servers WHERE id = ?`, [id], (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function insert(db, { name, host, port, username, password, location, status }) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO windows_servers (name, host, port, username, password, location, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, host, port || 22, username, password, location || null, status || 'active', now, now],
            function (err) {
                if (err) reject(err);
                else resolve({ id: this.lastID });
            }
        );
    });
}

function update(db, id, { name, host, port, username, password, location, status }) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE windows_servers
             SET name       = COALESCE(?, name),
                 host       = COALESCE(?, host),
                 port       = COALESCE(?, port),
                 username   = COALESCE(?, username),
                 password   = COALESCE(?, password),
                 location   = ?,
                 status     = COALESCE(?, status),
                 updated_at = ?
             WHERE id = ?`,
            [name, host, port, username, password, location ?? null, status, new Date().toISOString(), id],
            function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            }
        );
    });
}

function remove(db, id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM windows_servers WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

function updateStatus(db, id, { last_status, last_cpu_pct, last_ram_pct, last_disk_json, last_error, last_checked_at }) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE windows_servers
             SET last_status     = ?,
                 last_cpu_pct    = ?,
                 last_ram_pct    = ?,
                 last_disk_json  = ?,
                 last_error      = ?,
                 last_checked_at = ?,
                 updated_at      = ?
             WHERE id = ?`,
            [
                last_status,
                last_cpu_pct ?? null,
                last_ram_pct ?? null,
                last_disk_json ?? null,
                last_error ?? null,
                last_checked_at || new Date().toISOString(),
                new Date().toISOString(),
                id,
            ],
            function (err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            }
        );
    });
}

module.exports = { getAll, getById, insert, update, remove, updateStatus };
