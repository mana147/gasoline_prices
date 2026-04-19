function findUserByCredentials(db, username, password) {
    return new Promise((resolve, reject) => {
        const query = `SELECT id, username, email, full_name, role, status, created_at, last_login
                       FROM users
                       WHERE username = ? AND password = ? AND status = 'active'`;
        db.get(query, [username, password], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function updateLastLogin(db, userId) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET last_login = ? WHERE id = ?`,
            [new Date().toISOString(), userId],
            (err) => { if (err) reject(err); else resolve(); }
        );
    });
}

function findUserByUsername(db, username) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function createUser(db, { username, password, email, full_name }) {
    return new Promise((resolve, reject) => {
        const query = `INSERT INTO users (username, password, email, full_name, role, status, created_at, updated_at)
                       VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`;
        const now = new Date().toISOString();
        db.run(query, [username, password, email || null, full_name || null, now, now], function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });
}

function getAllUsers(db) {
    return new Promise((resolve, reject) => {
        const query = `SELECT id, username, email, full_name, role, status, created_at, last_login
                       FROM users ORDER BY created_at DESC`;
        db.all(query, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function findUserById(db, id) {
    return new Promise((resolve, reject) => {
        const query = `SELECT id, username, email, full_name, role, status, created_at, last_login
                       FROM users WHERE id = ?`;
        db.get(query, [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function updateUser(db, id, { email, full_name, role, status }) {
    return new Promise((resolve, reject) => {
        const query = `UPDATE users
                       SET email = COALESCE(?, email),
                           full_name = COALESCE(?, full_name),
                           role = COALESCE(?, role),
                           status = COALESCE(?, status),
                           updated_at = ?
                       WHERE id = ?`;
        db.run(query, [email, full_name, role, status, new Date().toISOString(), id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

function deleteUser(db, id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes);
        });
    });
}

module.exports = {
    findUserByCredentials,
    updateLastLogin,
    findUserByUsername,
    createUser,
    getAllUsers,
    findUserById,
    updateUser,
    deleteUser
};
