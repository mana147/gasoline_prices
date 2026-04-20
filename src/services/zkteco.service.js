const ZKLib = require('zkteco-js');
const zktecoModel = require('../models/zkteco.model');
const zkEmployeeModel = require('../models/zkEmployee.model');
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

async function getEmployees(deviceId) {
    await getDeviceById(deviceId);
    return zkEmployeeModel.getAllByDevice(sqlite_db, deviceId);
}

async function syncEmployees(deviceId) {
    const deviceRow = await getDeviceById(deviceId);
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        const result = await device.getUsers();
        const users = (result && result.data) ? result.data : [];
        await zkEmployeeModel.upsertMany(sqlite_db, deviceId, users);
        return { success: true, count: users.length, syncedAt: new Date().toISOString() };
    } catch (e) {
        if (e.status) throw e;
        const err = new Error(`Lỗi đồng bộ nhân viên: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

function _validateEmployee({ uid, userId, name, password }) {
    if (!uid || isNaN(uid) || uid < 1 || uid > 3000) {
        const err = new Error('UID phải là số từ 1 đến 3000');
        err.status = 400;
        throw err;
    }
    if (!userId || String(userId).length > 9) {
        const err = new Error('Mã nhân viên là bắt buộc và tối đa 9 ký tự');
        err.status = 400;
        throw err;
    }
    if (!name || String(name).length > 24) {
        const err = new Error('Họ tên là bắt buộc và tối đa 24 ký tự');
        err.status = 400;
        throw err;
    }
    if (password && String(password).length > 8) {
        const err = new Error('Mật khẩu tối đa 8 ký tự');
        err.status = 400;
        throw err;
    }
}

async function createEmployee(deviceId, fields) {
    const { uid, userId, name, password = '', role = 0, cardno = 0 } = fields;
    _validateEmployee({ uid, userId, name, password });
    const deviceRow = await getDeviceById(deviceId);
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        await device.setUser(Number(uid), String(userId), String(name), String(password), Number(role), Number(cardno));
        await zkEmployeeModel.insert(sqlite_db, deviceId, { uid: Number(uid), userId: String(userId), name: String(name), password: String(password), role: Number(role), cardno: Number(cardno) });
        return { success: true };
    } catch (e) {
        if (e.status) throw e;
        const err = new Error(`Lỗi tạo nhân viên: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

async function updateEmployee(deviceId, uid, fields) {
    const { userId, name, password = '', role = 0, cardno = 0 } = fields;
    const uidNum = Number(uid);
    _validateEmployee({ uid: uidNum, userId, name, password });
    const deviceRow = await getDeviceById(deviceId);
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        await device.setUser(uidNum, String(userId), String(name), String(password), Number(role), Number(cardno));
        await zkEmployeeModel.insert(sqlite_db, deviceId, { uid: uidNum, userId: String(userId), name: String(name), password: String(password), role: Number(role), cardno: Number(cardno) });
        return { success: true };
    } catch (e) {
        if (e.status) throw e;
        const err = new Error(`Lỗi cập nhật nhân viên: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

async function deleteEmployee(deviceId, uid) {
    const uidNum = Number(uid);
    if (!uidNum || uidNum < 1) {
        const err = new Error('UID không hợp lệ');
        err.status = 400;
        throw err;
    }
    const deviceRow = await getDeviceById(deviceId);
    const device = await _connectDevice(deviceRow).catch((e) => {
        const err = new Error(`Không thể kết nối tới thiết bị: ${e.message}`);
        err.status = 503;
        throw err;
    });
    try {
        await device.deleteUser(uidNum);
        await zkEmployeeModel.deleteOne(sqlite_db, deviceId, uidNum);
        return { success: true };
    } catch (e) {
        if (e.status) throw e;
        const err = new Error(`Lỗi xóa nhân viên: ${e.message}`);
        err.status = 503;
        throw err;
    } finally {
        try { device.disconnect(); } catch (_) { /* ignore */ }
    }
}

module.exports = { getDevices, getDeviceById, createDevice, updateDevice, deleteDevice, testConnection, setDeviceTime, syncDeviceTime, getEmployees, syncEmployees, createEmployee, updateEmployee, deleteEmployee };
