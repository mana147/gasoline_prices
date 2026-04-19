const { bangPhuThu } = require('../handle/calculator_gasoline');
const { sqlite_db } = require('../config/db');
const fuelService = require('../services/fuel.service');
const fuelPriceModel = require('../models/fuelPrice.model');

async function getFuelPrice(req, res) {
    try {
        let date = req.query.date || new Date().toISOString().split('T')[0];
        if (isNaN(Date.parse(date))) {
            date = new Date().toISOString().split('T')[0];
        }

        const result = await fuelService.fetchAndCalculateFuelPrice(date);

        await fuelPriceModel.insertFuelPrice(sqlite_db, {
            ...result,
            status: 'active',
            createdAt: new Date().toISOString()
        });

        res.json(result);
    } catch (err) {
        console.error('Error fetching fuel price:', err);
        res.status(500).json({ error: 'Failed to fetch fuel price' });
    }
}

function getSurchargeTable(req, res) {
    res.json(bangPhuThu);
}

module.exports = { getFuelPrice, getSurchargeTable };
