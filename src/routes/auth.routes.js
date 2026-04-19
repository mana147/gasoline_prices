const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const authController = require('../controllers/auth.controller');

router.get('/login', authController.getLoginPage);
router.post('/api/login', authController.login);
router.post('/api/logout', authMiddleware, authController.logout);
router.get('/api/me', authMiddleware, authController.getMe);
router.post('/api/register', authController.register);
router.get('/api/users', authMiddleware, adminMiddleware, authController.getUsers);
router.get('/api/users/:id', authMiddleware, authController.getUserById);
router.put('/api/users/:id', authMiddleware, authController.updateUser);
router.delete('/api/users/:id', authMiddleware, adminMiddleware, authController.deleteUser);

module.exports = router;
