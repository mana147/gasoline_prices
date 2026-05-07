const wifiService = require('../services/wifi.service');

function handleError(err, res, defaultMsg) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    if (err.status === 404) return res.status(404).json({ success: false, error: err.message });
    console.error(defaultMsg, err);
    res.status(500).json({ success: false, error: defaultMsg });
}

async function getAps(req, res) {
    try {
        const aps = await wifiService.getAps();
        res.json({ success: true, count: aps.length, aps });
    } catch (err) {
        handleError(err, res, 'Lỗi lấy danh sách AP');
    }
}

async function addAp(req, res) {
    try {
        const { name, ip, location, snmp_community, snmp_client_oid } = req.body;
        const ap = await wifiService.createAp({ name, ip, location, snmp_community, snmp_client_oid });
        res.status(201).json({ success: true, message: 'Thêm AP thành công', ap });
    } catch (err) {
        handleError(err, res, 'Lỗi thêm AP');
    }
}

async function editAp(req, res) {
    try {
        const { name, ip, location, snmp_community, snmp_client_oid, status } = req.body;
        const ap = await wifiService.updateAp(req.params.id, { name, ip, location, snmp_community, snmp_client_oid, status });
        res.json({ success: true, message: 'Cập nhật AP thành công', ap });
    } catch (err) {
        handleError(err, res, 'Lỗi cập nhật AP');
    }
}

async function removeAp(req, res) {
    try {
        await wifiService.deleteAp(req.params.id);
        res.json({ success: true, message: 'Xóa AP thành công' });
    } catch (err) {
        handleError(err, res, 'Lỗi xóa AP');
    }
}

async function checkAp(req, res) {
    try {
        const result = await wifiService.checkApNow(req.params.id);
        res.json({ success: true, ...result });
    } catch (err) {
        handleError(err, res, 'Lỗi kiểm tra AP');
    }
}

async function getEvents(req, res) {
    try {
        const events = await wifiService.getApEvents(req.params.id);
        res.json({ success: true, count: events.length, events });
    } catch (err) {
        handleError(err, res, 'Lỗi lấy lịch sử AP');
    }
}

async function pollAll(req, res) {
    try {
        wifiService.pollAll();
        res.json({ success: true, message: 'Đã kích hoạt poll tất cả AP' });
    } catch (err) {
        handleError(err, res, 'Lỗi poll AP');
    }
}

module.exports = { getAps, addAp, editAp, removeAp, checkAp, getEvents, pollAll };
