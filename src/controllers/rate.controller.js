const rateService = require('../services/rate.service');

async function getTrfStd(req, res) {
    try {
        const rates = await rateService.getRates();
        res.json(rates);
    } catch (err) {
        console.error('Error fetching TRF_STD data:', err);
        res.status(500).json({ error: 'Failed to fetch TRF_STD data' });
    }
}

async function updateTrfStd(req, res) {
    try {
        const { trf_code, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 } = req.body;
        const rowsAffected = await rateService.updateRate(trf_code, { hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 });
        res.json({ success: true, message: `Cập nhật ${trf_code} thành công`, rowsAffected });
    } catch (err) {
        if (err.status === 400) {
            return res.status(400).json({ success: false, error: err.message });
        }
        console.error('Error updating TRF_STD data:', err);
        res.status(500).json({ success: false, error: 'Failed to update TRF_STD data', details: err.message });
    }
}

module.exports = { getTrfStd, updateTrfStd };
