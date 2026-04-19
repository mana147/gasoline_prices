const { sqlite_db } = require('../config/db');
const { activeTokens, generateToken } = require('../middleware/auth');
const userModel = require('../models/user.model');

function getLoginPage(req, res) {
    res.render('login');
}

async function login(req, res) {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập username và password' });
    }

    try {
        const user = await userModel.findUserByCredentials(sqlite_db, username, password);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Username hoặc password không đúng' });
        }

        const token = generateToken();
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

        activeTokens.set(token, {
            user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role },
            expiresAt
        });

        await userModel.updateLastLogin(sqlite_db, user.id);

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            expiresIn: '24h',
            user: { id: user.id, username: user.username, email: user.email, full_name: user.full_name, role: user.role }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

function logout(req, res) {
    activeTokens.delete(req.token);
    res.json({ success: true, message: 'Đăng xuất thành công' });
}

function getMe(req, res) {
    res.json({ success: true, user: req.user });
}

async function register(req, res) {
    const { username, password, email, full_name } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập username và password' });
    }

    try {
        const existing = await userModel.findUserByUsername(sqlite_db, username);
        if (existing) {
            return res.status(409).json({ success: false, message: 'Username đã tồn tại' });
        }

        const id = await userModel.createUser(sqlite_db, { username, password, email, full_name });

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công',
            user: { id, username, email, full_name, role: 'user' }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Lỗi khi tạo tài khoản' });
    }
}

async function getUsers(req, res) {
    try {
        const users = await userModel.getAllUsers(sqlite_db);
        res.json({ success: true, count: users.length, users });
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

async function getUserById(req, res) {
    try {
        const user = await userModel.findUserById(sqlite_db, req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        res.json({ success: true, user });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

async function updateUser(req, res) {
    const { email, full_name, role, status } = req.body;
    try {
        const changes = await userModel.updateUser(sqlite_db, req.params.id, { email, full_name, role, status });
        if (changes === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

async function deleteUser(req, res) {
    try {
        const changes = await userModel.deleteUser(sqlite_db, req.params.id);
        if (changes === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy user' });
        res.json({ success: true, message: 'Xóa user thành công' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
}

module.exports = { getLoginPage, login, logout, getMe, register, getUsers, getUserById, updateUser, deleteUser };
