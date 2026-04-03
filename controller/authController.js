// Auth Controller - Xử lý các API liên quan đến authentication và user management
const express = require('express');
const router = express.Router();

// Import auth middleware
const { activeTokens, generateToken, authMiddleware, adminMiddleware } = require('../middleware/auth');

// Khởi tạo biến sqlite_db - sẽ được inject từ main.js
let sqlite_db = null;

// Function để inject sqlite_db từ main.js
const initDB = (db) => {
    sqlite_db = db;
};

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Route đăng nhập - GET /login
router.get('/login', (req, res) => {
    res.sendFile(require('path').join(__dirname, '../view/login.html'));
});

// POST /api/login - Đăng nhập
router.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập username và password'
        });
    }

    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login
                   FROM users 
                   WHERE username = ? AND password = ? AND status = 'active'`;

    sqlite_db.get(query, [username, password], (err, user) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Username hoặc password không đúng'
            });
        }

        // Generate token
        const token = generateToken();
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

        // Store token
        activeTokens.set(token, {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            },
            expiresAt
        });

        // Update last_login
        sqlite_db.run(`UPDATE users SET last_login = ? WHERE id = ?`,
            [new Date().toISOString(), user.id]);

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            expiresIn: '24h',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
    });
});

// POST /api/logout - Đăng xuất
router.post('/api/logout', authMiddleware, (req, res) => {
    activeTokens.delete(req.token);
    res.json({
        success: true,
        message: 'Đăng xuất thành công'
    });
});

// GET /api/me - Lấy thông tin user hiện tại
router.get('/api/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// POST /api/register - Đăng ký
router.post('/api/register', (req, res) => {
    const { username, password, email, full_name } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập username và password'
        });
    }

    // Check if username exists
    sqlite_db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, existing) => {
        if (err) {
            console.error('Register error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Username đã tồn tại'
            });
        }

        // Insert new user
        const query = `INSERT INTO users (username, password, email, full_name, role, status, created_at, updated_at) 
                       VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`;
        const now = new Date().toISOString();

        sqlite_db.run(query, [username, password, email || null, full_name || null, now, now], function (err) {
            if (err) {
                console.error('Register insert error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi tạo tài khoản'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                user: {
                    id: this.lastID,
                    username,
                    email,
                    full_name,
                    role: 'user'
                }
            });
        });
    });
});

// GET /api/users - Lấy danh sách users (chỉ admin)
router.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login 
                   FROM users 
                   ORDER BY created_at DESC`;

    sqlite_db.all(query, [], (err, users) => {
        if (err) {
            console.error('Get users error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        res.json({
            success: true,
            count: users.length,
            users
        });
    });
});

// GET /api/users/:id - Lấy thông tin user theo ID
router.get('/api/users/:id', authMiddleware, (req, res) => {
    const { id } = req.params;

    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login 
                   FROM users 
                   WHERE id = ?`;

    sqlite_db.get(query, [id], (err, user) => {
        if (err) {
            console.error('Get user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            user
        });
    });
});

// PUT /api/users/:id - Cập nhật thông tin user
router.put('/api/users/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { email, full_name, role, status } = req.body;

    const query = `UPDATE users 
                   SET email = COALESCE(?, email),
                       full_name = COALESCE(?, full_name),
                       role = COALESCE(?, role),
                       status = COALESCE(?, status),
                       updated_at = ?
                   WHERE id = ?`;

    sqlite_db.run(query, [email, full_name, role, status, new Date().toISOString(), id], function (err) {
        if (err) {
            console.error('Update user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật thành công'
        });
    });
});

// DELETE /api/users/:id - Xóa user (chỉ admin)
router.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;

    sqlite_db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
        if (err) {
            console.error('Delete user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            message: 'Xóa user thành công'
        });
    });
});

module.exports = { router, initDB };
