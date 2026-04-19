const crypto = require('crypto');

const activeTokens = new Map();

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập. Vui lòng cung cấp token!'
        });
    }

    const userData = activeTokens.get(token);
    if (!userData) {
        return res.status(401).json({
            success: false,
            message: 'Token không hợp lệ hoặc đã hết hạn!'
        });
    }

    if (Date.now() > userData.expiresAt) {
        activeTokens.delete(token);
        return res.status(401).json({
            success: false,
            message: 'Token đã hết hạn. Vui lòng đăng nhập lại!'
        });
    }

    req.user = userData.user;
    req.token = token;
    next();
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền truy cập. Chỉ admin mới được phép!'
        });
    }
    next();
}

module.exports = { activeTokens, generateToken, authMiddleware, adminMiddleware };
