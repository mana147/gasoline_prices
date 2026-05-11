/**
 * test_ssh_windows.js
 * ----------------------------------------------------------------------------
 * Script kiểm tra kết nối SSH tới 1 Windows Server và chạy PowerShell để lấy
 * CPU / RAM / Disk. Mục đích: VERIFY rằng môi trường đã sẵn sàng trước khi
 * triển khai tính năng Windows Server Monitoring theo plan.
 *
 * Yêu cầu trước khi chạy:
 *   1. Windows Server đích đã cài & bật OpenSSH Server (xem hướng dẫn ở
 *      brainstorm_idea/OPENSSH_WINDOWS_SETUP.md).
 *   2. Tài khoản dùng để SSH có quyền admin trên Windows (để chạy được
 *      Get-CimInstance Win32_OperatingSystem và sau này Restart-Computer).
 *   3. Cài dependency:  npm install ssh2
 *
 * Cách chạy:
 *   node scripts/test_ssh_windows.js <host> <username> <password> [port]
 *
 * Ví dụ:
 *   node scripts/test_ssh_windows.js 10.10.5.21 Administrator "P@ssw0rd"
 *   node scripts/test_ssh_windows.js srv-app01.local admin "mypw" 22
 *
 * Output thành công sẽ in JSON:
 *   { cpu: 12, ram: 47.3, disks: [{name:"C", used_gb:..., ...}] }
 * ----------------------------------------------------------------------------
 */

const { Client } = require('ssh2');

const [, , host, username, password, portArg] = process.argv;
const port = portArg ? parseInt(portArg, 10) : 22;

if (!host || !username || !password) {
    console.error('Usage: node scripts/test_ssh_windows.js <host> <username> <password> [port]');
    process.exit(1);
}

// PowerShell script chạy 1 lần, trả về JSON gồm cpu / ram / disks.
// Khi triển khai feature thật, script này sẽ được đặt trong windows.service.js.
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
        hostname = $env:COMPUTERNAME
        os       = $os.Caption
        uptime_sec = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
        cpu      = $cpu
        ram      = $ramPct
        disks    = @($disks)
    }
    $result | ConvertTo-Json -Compress -Depth 4
} catch {
    @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
}
`.trim();

function runPowerShell(opts, script) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = '';
        let stderr = '';

        const timeoutMs = 15000;
        const timer = setTimeout(() => {
            try { conn.end(); } catch (_) {}
            reject(new Error(`SSH operation timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        conn
            .on('ready', () => {
                console.log(`[OK] SSH handshake thành công với ${opts.host}:${opts.port}`);
                // -EncodedCommand cần UTF-16 LE base64 để tránh escape phức tạp.
                const b64 = Buffer.from(script, 'utf16le').toString('base64');
                const cmd = `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`;

                conn.exec(cmd, (err, stream) => {
                    if (err) {
                        clearTimeout(timer);
                        conn.end();
                        return reject(err);
                    }
                    stream
                        .on('close', (code) => {
                            clearTimeout(timer);
                            conn.end();
                            if (code === 0) {
                                resolve(stdout.trim());
                            } else {
                                reject(new Error(`PowerShell exit code ${code}. stderr: ${stderr.trim()}`));
                            }
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
                host: opts.host,
                port: opts.port,
                username: opts.username,
                password: opts.password,
                readyTimeout: 10000,
            });
    });
}

(async () => {
    console.log('--------------------------------------------------------------');
    console.log(`[INFO] Đang kết nối SSH tới ${username}@${host}:${port} ...`);
    console.log('--------------------------------------------------------------');

    const t0 = Date.now();
    try {
        const out = await runPowerShell({ host, port, username, password }, PS_SCRIPT);
        const ms = Date.now() - t0;

        console.log(`[OK] PowerShell thực thi xong (${ms}ms). Raw output:\n`);
        console.log(out);
        console.log('\n--------------------------------------------------------------');

        let parsed;
        try {
            parsed = JSON.parse(out);
        } catch (e) {
            console.error('[ERR] Output không phải JSON hợp lệ:', e.message);
            process.exit(2);
        }

        if (parsed.error) {
            console.error('[ERR] PowerShell trả về lỗi:', parsed.error);
            process.exit(3);
        }

        console.log('[RESULT] Parsed metrics:');
        console.log(`  Hostname    : ${parsed.hostname}`);
        console.log(`  OS          : ${parsed.os}`);
        console.log(`  Uptime      : ${parsed.uptime_sec} giây (~${Math.round(parsed.uptime_sec / 3600)}h)`);
        console.log(`  CPU load    : ${parsed.cpu}%`);
        console.log(`  RAM used    : ${parsed.ram}%`);
        console.log(`  Disks       :`);
        for (const d of parsed.disks) {
            console.log(`    - ${d.name}: ${d.used_gb}/${d.total_gb} GB (${d.used_pct}% used, ${d.free_gb} GB free)`);
        }

        console.log('\n[DONE] ✅ Môi trường đã sẵn sàng. Có thể triển khai feature theo plan.');
        process.exit(0);
    } catch (err) {
        const ms = Date.now() - t0;
        console.error(`\n[FAIL] ❌ Lỗi sau ${ms}ms: ${err.message}`);
        console.error('\nGỢI Ý DEBUG:');
        console.error('  - Kiểm tra firewall Windows mở port 22 (hoặc port bạn cấu hình).');
        console.error('  - Kiểm tra service "OpenSSH SSH Server" đang Running:');
        console.error('      Get-Service sshd');
        console.error('  - Thử SSH thủ công từ máy này:');
        console.error(`      ssh ${username}@${host} -p ${port}`);
        console.error('  - Nếu auth fail: xác minh username/password (không phải email Microsoft account).');
        console.error('  - Xem chi tiết hướng dẫn cài: brainstorm_idea/OPENSSH_WINDOWS_SETUP.md');
        process.exit(1);
    }
})();
