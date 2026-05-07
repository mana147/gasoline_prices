const express = require('express');
const router  = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const wifiController = require('../controllers/wifi.controller');

const admin = [authMiddleware, adminMiddleware];

router.get('/api/wifi/aps',                 ...admin, wifiController.getAps);
router.post('/api/wifi/aps',                ...admin, wifiController.addAp);
router.put('/api/wifi/aps/:id',             ...admin, wifiController.editAp);
router.delete('/api/wifi/aps/:id',          ...admin, wifiController.removeAp);
router.post('/api/wifi/aps/:id/check',      ...admin, wifiController.checkAp);
router.get('/api/wifi/aps/:id/events',      ...admin, wifiController.getEvents);
router.post('/api/wifi/poll',               ...admin, wifiController.pollAll);

module.exports = router;
