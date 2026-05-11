const { Client } = require('ssh2');
const windowsServerModel = require('../models/windowsServer.model');
const windowsEventModel  = require('../models/windowsEvent.model');
const { sqlite_windows_db } = require('../config/db');

const HOST_REGEX = /^[a-zA-Z0-9._-]+$/;

// PowerShell script lấy CPU / RAM / Disk / Uptime / OS — copy từ scripts/test_ssh_windows.js
const PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
    $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $os  = Get-CimInstance Win32_OperatingSystem
    $ramPct = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)
    $disks = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null -and ($_.Used + $_.Free) -gt 0 } | ForEach-Object {
        $total = $_.Used + $_.Free
        @{
            name     = $_.Name
            used_gb  = [math]::Round($_.Used / 1GB, 1)
            free_gb  = [math]::Round($_.Free / 1GB, 1)
            total_gb = [math]::Round($total  / 1GB, 1)
            used_pct = [math]::Round($_.Used / $total * 100, 1)
        }
    }
    $result = @{
        hostname   = $env:COMPUTERNAME
        os         = $os.Caption
        uptime_sec = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
        cpu        = $cpu
        ram        = $ramPct
        disks      = @($disks)
    }
    $result | ConvertTo-Json -Compress -Depth 4
} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
`.trim();

// ─── Validation ───────────────────────────────────────────────────────────────

function validateServerFields({ name, host, username, password, port }) {
    if (!name || !host || !username || !password) {
        const err = new Error('Thiếu thông tin bắt buộc: name, host, username, password');
        err.status = 400;
        throw err;
    }
    if (!HOST_REGEX.test(host)) {
        const err = new Error('Host không hợp lệ');
        err.status = 400;
        throw err;
    }
    if (port !== undefined && port !== null && (isNaN(port) || port < 1 || port > 65535)) {
        const err = new Error('Port không hợp lệ (1–65535)');
        err.status = 400;
        throw err;
    }
}

// ─── SSH helper ───────────────────────────────────────────────────────────────

function runSSH(server, command, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            try { conn.end(); } catch (_) {}
            reject(new Error(`SSH timeout sau ${timeoutMs}ms`));
        }, timeoutMs);

        conn
            .on('ready', () => {
                conn.exec(command, (err, stream) => {
                    if (err) {
                        clearTimeout(timer);
                        conn.end();
                        return reject(err);
                    }
                    stream
                        .on('close', (code) => {
                            clearTimeout(timer);
                            conn.end();
                            if (code === 0) resolve(stdout.trim());
                            else reject(new Error(`Exit code ${code}. stderr: ${stderr.trim()}`));
                        })
                        .on('data', (d) => { stdout += d.toString(); })
                        .stderr.on('data', (d) => { stderr += d.toString(); });
                });
            })
            .on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            })
            .connect({
                host:         server.host,
                port:         server.port || 22,
                username:     server.username,
                password:     server.password,
                readyTimeout: timeoutMs,
            });
    });
}

function buildPSCommand(script) {
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    return `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`;
}

// ─── Core check ───────────────────────────────────────────────────────────────

async function checkServer(server) {
    const prevStatus = server.last_status;
    let newStatus    = 'down';
    let cpu = null, ram = null, diskJson = null, errorMsg = null;

    try {
        const cmd = buildPSCommand(PS_SCRIPT);
        const out = await runSSH(server, cmd, 10000);
        const parsed = JSON.parse(out);

        if (parsed.error) throw new Error(parsed.error);

        cpu      = parsed.cpu ?? null;
        ram      = parsed.ram ?? null;
        diskJson = JSON.stringify(parsed.disks || []);
        newStatus = 'up';
    } catch (err) {
        errorMsg = err.message;
    }

    const now = new Date().toISOString();
    await windowsServerModel.updateStatus(sqlite_windows_db, server.id, {
        last_status:     newStatus,
        last_cpu_pct:    cpu,
        last_ram_pct:    ram,
        last_disk_json:  diskJson,
        last_error:      errorMsg,
        last_checked_at: now,
    });

    if (prevStatus !== newStatus) {
        await windowsEventModel.insert(sqlite_windows_db, {
            server_id:  server.id,
            event_type: newStatus,
            message:    newStatus === 'down' ? errorMsg : null,
            cpu_pct:    cpu,
            ram_pct:    ram,
        });
        console.log(`> LOG: Windows ${server.name} (${server.host}) — ${prevStatus} → ${newStatus}`);
    }

    return { host: server.host, name: server.name, status: newStatus, cpu, ram, disk_json: diskJson, error: errorMsg };
}

// ─── Restart / Shutdown ───────────────────────────────────────────────────────

async function restartServer(server) {
    const cmd = buildPSCommand(`Restart-Computer -Force`);
    try {
        await runSSH(server, cmd, 8000);
    } catch (err) {
        // Restart-Computer đóng kết nối ngay → SSH có thể báo lỗi "stream closed" — bỏ qua
        if (!err.message.includes('stream') && !err.message.includes('closed') && !err.message.includes('EOF')) {
            throw err;
        }
    }
    await windowsServerModel.updateStatus(sqlite_windows_db, server.id, {
        last_status:     'unknown',
        last_cpu_pct:    null,
        last_ram_pct:    null,
        last_disk_json:  null,
        last_error:      null,
        last_checked_at: new Date().toISOString(),
    });
    await windowsEventModel.insert(sqlite_windows_db, {
        server_id:  server.id,
        event_type: 'restart',
        message:    'Restart-Computer triggered by user',
        cpu_pct:    null,
        ram_pct:    null,
    });
}

async function shutdownServer(server) {
    const cmd = buildPSCommand(`Stop-Computer -Force`);
    try {
        await runSSH(server, cmd, 8000);
    } catch (err) {
        if (!err.message.includes('stream') && !err.message.includes('closed') && !err.message.includes('EOF')) {
            throw err;
        }
    }
    await windowsServerModel.updateStatus(sqlite_windows_db, server.id, {
        last_status:     'unknown',
        last_cpu_pct:    null,
        last_ram_pct:    null,
        last_disk_json:  null,
        last_error:      null,
        last_checked_at: new Date().toISOString(),
    });
    await windowsEventModel.insert(sqlite_windows_db, {
        server_id:  server.id,
        event_type: 'shutdown',
        message:    'Stop-Computer triggered by user',
        cpu_pct:    null,
        ram_pct:    null,
    });
}

// ─── Poll all ─────────────────────────────────────────────────────────────────

async function pollAll() {
    let servers = [];
    try {
        const all = await windowsServerModel.getAll(sqlite_windows_db);
        servers = all.filter(s => s.status === 'active');
    } catch (err) {
        console.error('> ERROR: Windows pollAll failed to load servers:', err.message);
        return;
    }

    if (servers.length === 0) return;

    const results = await Promise.allSettled(servers.map(s => checkServer(s)));
    const failed  = results.filter(r => r.status === 'rejected').length;
    console.log(`> LOG: Windows poll complete — ${servers.length} servers checked${failed ? `, ${failed} error(s)` : ''}`);
}

function startPolling(intervalMs = 300000) {
    console.log(`> LOG: Windows polling started (interval: ${intervalMs}ms)`);
    pollAll();
    setInterval(pollAll, intervalMs);
}

// ─── CRUD wrappers ────────────────────────────────────────────────────────────

async function getServers() {
    return windowsServerModel.getAll(sqlite_windows_db);
}

async function getServer(id) {
    const server = await windowsServerModel.getById(sqlite_windows_db, id);
    if (!server) {
        const err = new Error('Không tìm thấy server');
        err.status = 404;
        throw err;
    }
    return server;
}

async function createServer({ name, host, port, username, password, location, status }) {
    validateServerFields({ name, host, username, password, port });
    const { id } = await windowsServerModel.insert(sqlite_windows_db, { name, host, port, username, password, location, status });
    return windowsServerModel.getById(sqlite_windows_db, id);
}

async function updateServer(id, fields) {
    await getServer(id);
    validateServerFields({
        name:     fields.name     || 'x',
        host:     fields.host     || 'x',
        username: fields.username || 'x',
        password: fields.password || 'x',
        port:     fields.port,
    });
    const { changes } = await windowsServerModel.update(sqlite_windows_db, id, fields);
    if (!changes) {
        const err = new Error('Không tìm thấy server');
        err.status = 404;
        throw err;
    }
    return windowsServerModel.getById(sqlite_windows_db, id);
}

async function deleteServer(id) {
    await getServer(id);
    return windowsServerModel.remove(sqlite_windows_db, id);
}

async function checkServerNow(id) {
    const server = await getServer(id);
    return checkServer(server);
}

async function restartServerNow(id) {
    const server = await getServer(id);
    return restartServer(server);
}

async function shutdownServerNow(id) {
    const server = await getServer(id);
    return shutdownServer(server);
}

async function getServerEvents(id, limit = 50) {
    await getServer(id);
    return windowsEventModel.getByServerId(sqlite_windows_db, id, limit);
}

module.exports = {
    startPolling,
    pollAll,
    getServers,
    getServer,
    createServer,
    updateServer,
    deleteServer,
    checkServerNow,
    restartServerNow,
    shutdownServerNow,
    getServerEvents,
};
