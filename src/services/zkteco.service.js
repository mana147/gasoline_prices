const ZKLib = require('zkteco-js');
const zktecoModel = require('../models/zkteco.model');
const { sqlite_db } = require('../config/db');

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function validateDeviceFields({ name, ip, port, timeout }) {
    if (!name || !ip) {
        const err = new Error('Tên và địa chỉ IP là bắt buộc');
        err.status = 400;
        throw err;
    }
    if (!IP_REGEX.test(ip)) {
        const err = new Error('Địa chỉ IP không hợp lệ');
        err.status = 400;
        throw err;
    }
    if (port !== undefined && port !== null && (isNaN(port) || port < 1 || port > 65535)) {
        const err = new Error('Port phải từ 1 đến 65535');
        err.status = 400;
        throw err;
    }
    if (timeout !== undefined && timeout !== null && (isNaN(timeout) || timeout < 1000)) {
        const err = new Error('Timeout tối thiểu 1000ms');
        err.status = 400;
        throw err;
    }
}

async function getDevices() {
    return zktecoModel.getAllDevices(sqlite_db);
}

async function getDeviceById(id) {
    const device = await zktecoModel.getDeviceById(sqlite_db, id);
    if (!device) {
        const err = new Error('Không tìm thấy thiết bị');
        err.status = 404;
        throw err;
    }
    return device;
}

async function createDevice(fields) {
    validateDeviceFields(fields);
    return zktecoModel.createDevice(sqlite_db, fields);
}

async function updateDevice(id, fields) {
    await getDeviceById(id);
    if (fields.ip || fields.name) validateDeviceFields({ name: fields.name || 'ok', ip: fields.ip || '0.0.0.0', ...fields });
    const changes = await zktecoModel.updateDevice(sqlite_db, id, fields);
    if (changes === 0) {
        const err = new Error('Không tìm thấy thiết bị');
        err.status = 404;
        throw err;
    }
    return changes;
}

async function deleteDevice(id) {
    await getDeviceById(id);
    return zktecoModel.deleteDevice(sqlite_db, id);
}

async function _connectDevice(deviceRow) {
    const device = new ZKLib(deviceRow.ip, deviceRow.port, deviceRow.timeout, 5200);
    await device.createSocket();
    return device;
}

async function testConnection(id) {
    const deviceRow = await getDeviceById(id);
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        const [deviceName, serialNumber, firmware] = await Promise.all([
            device.getDeviceName(),
            device.getSerialNumber(),
            device.getFirmware()
        ]);
        return { connected: true, deviceName, serialNumber, firmware };
    } catch (e) {
        const err = new Error(`Lỗi đọc thông tin thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

async function setDeviceTime(id, datetimeStr) {
    if (!datetimeStr || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(datetimeStr)) {
        const err = new Error('Định dạng datetime không hợp lệ (YYYY-MM-DD HH:MM:SS)');
        err.status = 400;
        throw err;
    }
    const deviceRow = await getDeviceById(id);
    const date = new Date(datetimeStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
        const err = new Error('Giá trị datetime không hợp lệ');
        err.status = 400;
        throw err;
    }
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        await device.setTime(date);
        return { success: true, datetime: datetimeStr };
    } catch (e) {
        const err = new Error(`Lỗi đặt giờ: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

async function syncDeviceTime(id) {
    const deviceRow = await getDeviceById(id);
    const now = new Date();
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        await device.setTime(now);
        return { success: true, syncedAt: now.toISOString() };
    } catch (e) {
        const err = new Error(`Lỗi đồng bộ giờ: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

module.exports = { getDevices, getDeviceById, createDevice, updateDevice, deleteDevice, testConnection, setDeviceTime, syncDeviceTime };
