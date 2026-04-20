const zktecoService = require('../services/zkteco.service');

function handleServiceError(err, res, defaultMsg) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    if (err.status === 404) return res.status(404).json({ success: false, error: err.message });
    if (err.status === 503) return res.status(503).json({ success: false, error: err.message });
    console.error(defaultMsg, err);
    res.status(500).json({ success: false, error: defaultMsg });
}

async function getDevices(req, res) {
    try {
        const devices = await zktecoService.getDevices();
        res.json({ success: true, count: devices.length, devices });
    } catch (err) {
        console.error('Lỗi lấy danh sách thiết bị:', err);
        res.status(500).json({ success: false, error: 'Lỗi lấy danh sách thiết bị' });
    }
}

async function addDevice(req, res) {
    try {
        const { name, ip, port, timeout, location } = req.body;
        const id = await zktecoService.createDevice({ name, ip, port: parseInt(port) || 4370, timeout: parseInt(timeout) || 5000, location });
        res.status(201).json({ success: true, message: 'Thêm thiết bị thành công', id });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi thêm thiết bị');
    }
}

async function editDevice(req, res) {
    try {
        const { name, ip, port, timeout, location, status } = req.body;
        await zktecoService.updateDevice(req.params.id, {
            name, ip,
            port: port !== undefined ? parseInt(port) : undefined,
            timeout: timeout !== undefined ? parseInt(timeout) : undefined,
            location, status
        });
        res.json({ success: true, message: 'Cập nhật thiết bị thành công' });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi cập nhật thiết bị');
    }
}

async function removeDevice(req, res) {
    try {
        await zktecoService.deleteDevice(req.params.id);
        res.json({ success: true, message: 'Xóa thiết bị thành công' });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi xóa thiết bị');
    }
}

async function testConnection(req, res) {
    try {
        const result = await zktecoService.testConnection(req.params.id);
        res.json({ success: true, ...result });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi kiểm tra kết nối');
    }
}

async function setTime(req, res) {
    try {
        const { datetime } = req.body;
        if (!datetime) return res.status(400).json({ success: false, error: 'Thiếu trường datetime' });
        const result = await zktecoService.setDeviceTime(req.params.id, datetime);
        res.json({ success: true, ...result });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi đặt giờ thiết bị');
    }
}

async function syncTime(req, res) {
    try {
        const result = await zktecoService.syncDeviceTime(req.params.id);
        res.json({ success: true, ...result });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi đồng bộ giờ thiết bị');
    }
}

async function renderDeviceDetail(req, res) {
    try {
        const device = await zktecoService.getDeviceById(req.params.id);
        res.render('zkteco_device', { device });
    } catch (err) {
        if (err.status === 404) return res.status(404).send('Không tìm thấy thiết bị');
        console.error('Lỗi render trang thiết bị:', err);
        res.status(500).send('Lỗi server');
    }
}

async function getEmployees(req, res) {
    try {
        const employees = await zktecoService.getEmployees(req.params.id);
        res.json({ success: true, count: employees.length, employees });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi lấy danh sách nhân viên');
    }
}

async function syncEmployees(req, res) {
    try {
        const result = await zktecoService.syncEmployees(req.params.id);
        res.json(result);
    } catch (err) {
        handleServiceError(err, res, 'Lỗi đồng bộ nhân viên');
    }
}

async function createEmployee(req, res) {
    try {
        const { uid, userId, name, password, role, cardno } = req.body;
        const result = await zktecoService.createEmployee(req.params.id, { uid, userId, name, password, role, cardno });
        res.status(201).json({ ...result, message: 'Thêm nhân viên thành công' });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi thêm nhân viên');
    }
}

async function updateEmployee(req, res) {
    try {
        const { userId, name, password, role, cardno } = req.body;
        const result = await zktecoService.updateEmployee(req.params.id, req.params.uid, { userId, name, password, role, cardno });
        res.json({ ...result, message: 'Cập nhật nhân viên thành công' });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi cập nhật nhân viên');
    }
}

async function deleteEmployee(req, res) {
    try {
        const result = await zktecoService.deleteEmployee(req.params.id, req.params.uid);
        res.json({ ...result, message: 'Xóa nhân viên thành công' });
    } catch (err) {
        handleServiceError(err, res, 'Lỗi xóa nhân viên');
    }
}

module.exports = { getDevices, addDevice, editDevice, removeDevice, testConnection, setTime, syncTime, renderDeviceDetail, getEmployees, syncEmployees, createEmployee, updateEmployee, deleteEmployee };
