const express = require('express');
const router  = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const windowsController = require('../controllers/windows.controller');

const admin = [authMiddleware, adminMiddleware];

router.get('/api/windows/servers',                   ...admin, windowsController.getServers);
router.post('/api/windows/servers',                  ...admin, windowsController.addServer);
router.put('/api/windows/servers/:id',               ...admin, windowsController.editServer);
router.delete('/api/windows/servers/:id',            ...admin, windowsController.removeServer);
router.post('/api/windows/servers/:id/check',        ...admin, windowsController.checkServer);
router.post('/api/windows/servers/:id/restart',      ...admin, windowsController.restartServer);
router.post('/api/windows/servers/:id/shutdown',     ...admin, windowsController.shutdownServer);
router.get('/api/windows/servers/:id/events',        ...admin, windowsController.getEvents);
router.post('/api/windows/poll',                     ...admin, windowsController.pollAll);

module.exports = router;
