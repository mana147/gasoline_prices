const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const fuelController = require('../controllers/fuel.controller');

router.get('/api/get_fuel_price', authMiddleware, fuelController.getFuelPrice);
router.get('/api/get_surcharge_table', fuelController.getSurchargeTable);

module.exports = router;
