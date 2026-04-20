const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const zktecoController = require('../controllers/zkteco.controller');

const admin = [authMiddleware, adminMiddleware];

router.get('/api/zkteco/devices',                 ...admin, zktecoController.getDevices);
router.post('/api/zkteco/devices',                ...admin, zktecoController.addDevice);
router.put('/api/zkteco/devices/:id',             ...admin, zktecoController.editDevice);
router.delete('/api/zkteco/devices/:id',          ...admin, zktecoController.removeDevice);
router.post('/api/zkteco/devices/:id/test',       ...admin, zktecoController.testConnection);
router.post('/api/zkteco/devices/:id/set-time',   ...admin, zktecoController.setTime);
router.post('/api/zkteco/devices/:id/sync-time',  ...admin, zktecoController.syncTime);

module.exports = router;
