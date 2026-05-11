const windowsService = require('../services/windows.service');

function handleError(err, res, defaultMsg) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    if (err.status === 404) return res.status(404).json({ success: false, error: err.message });
    if (err.status === 502) return res.status(502).json({ success: false, error: err.message });
    console.error(defaultMsg, err);
    res.status(500).json({ success: false, error: defaultMsg });
}

async function getServers(req, res) {
    try {
        const servers = await windowsService.getServers();
        res.json({ success: true, count: servers.length, servers });
    } catch (err) {
        handleError(err, res, 'Lỗi lấy danh sách server');
    }
}

async function addServer(req, res) {
    try {
        const { name, host, port, username, password, location, status } = req.body;
        const server = await windowsService.createServer({ name, host, port, username, password, location, status });
        res.status(201).json({ success: true, message: 'Thêm server thành công', server });
    } catch (err) {
        handleError(err, res, 'Lỗi thêm server');
    }
}

async function editServer(req, res) {
    try {
        const { name, host, port, username, password, location, status } = req.body;
        const server = await windowsService.updateServer(req.params.id, { name, host, port, username, password, location, status });
        res.json({ success: true, message: 'Cập nhật server thành công', server });
    } catch (err) {
        handleError(err, res, 'Lỗi cập nhật server');
    }
}

async function removeServer(req, res) {
    try {
        await windowsService.deleteServer(req.params.id);
        res.json({ success: true, message: 'Xóa server thành công' });
    } catch (err) {
        handleError(err, res, 'Lỗi xóa server');
    }
}

async function checkServer(req, res) {
    try {
        const result = await windowsService.checkServerNow(req.params.id);
        if (result.status === 'down') {
            const err = new Error(`Không kết nối được server qua SSH: ${result.error}`);
            err.status = 502;
            return handleError(err, res, '');
        }
        res.json({ success: true, ...result });
    } catch (err) {
        handleError(err, res, 'Lỗi kiểm tra server');
    }
}

async function restartServer(req, res) {
    try {
        await windowsService.restartServerNow(req.params.id);
        res.json({ success: true, message: 'Đã gửi lệnh restart server' });
    } catch (err) {
        handleError(err, res, 'Lỗi restart server');
    }
}

async function shutdownServer(req, res) {
    try {
        await windowsService.shutdownServerNow(req.params.id);
        res.json({ success: true, message: 'Đã gửi lệnh shutdown server' });
    } catch (err) {
        handleError(err, res, 'Lỗi shutdown server');
    }
}

async function getEvents(req, res) {
    try {
        const events = await windowsService.getServerEvents(req.params.id);
        res.json({ success: true, count: events.length, events });
    } catch (err) {
        handleError(err, res, 'Lỗi lấy lịch sử server');
    }
}

async function pollAll(req, res) {
    try {
        windowsService.pollAll();
        res.json({ success: true, message: 'Đã kích hoạt poll tất cả server' });
    } catch (err) {
        handleError(err, res, 'Lỗi poll server');
    }
}

module.exports = { getServers, addServer, editServer, removeServer, checkServer, restartServer, shutdownServer, getEvents, pollAll };
