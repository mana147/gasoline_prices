const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const rateController = require('../controllers/rate.controller');

router.get('/api/get_trf_std', authMiddleware, rateController.getTrfStd);
router.post('/api/update_trf_std', authMiddleware, adminMiddleware, rateController.updateTrfStd);

module.exports = router;
