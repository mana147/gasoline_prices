// scripts/test_snmp_wifi.js
// Mục đích: Xác nhận SNMP hoạt động trên các Altai WiFi AP trước khi build feature
//
// Usage : node scripts/test_snmp_wifi.js [community] [ip1] [ip2] ...
// Ví dụ : node scripts/test_snmp_wifi.js public
//          node scripts/test_snmp_wifi.js public 172.16.82.2
//          node scripts/test_snmp_wifi.js mystring 172.16.82.2 172.16.82.3

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const snmp = require('net-snmp');
const ping = require('ping');

const COMMUNITY = process.argv[2] || 'public';
const IPS = process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : [
        '172.16.82.2',
        '172.16.82.3',
        '172.16.82.4',
        '172.16.82.5',
        '172.16.82.7',
        '172.16.82.8',
        '172.16.82.10',
      ];

// OID chuẩn MIB-II (RFC 1213) — hoạt động trên hầu hết thiết bị SNMP
const OIDS = {
    sysDescr:    '1.3.6.1.2.1.1.1.0',  // mô tả thiết bị: model, firmware
    sysUpTime:   '1.3.6.1.2.1.1.3.0',  // uptime tính từ boot cuối (timeticks, /100 = giây)
    sysName:     '1.3.6.1.2.1.1.5.0',  // hostname AP
    sysLocation: '1.3.6.1.2.1.1.6.0',  // vị trí (nếu được cấu hình trên AP)
    ifNumber:    '1.3.6.1.2.1.2.1.0',  // số lượng interface (wlan0, eth0, ...)
};

function formatUptime(timeticks) {
    const totalSec = Math.floor(timeticks / 100);
    const days    = Math.floor(totalSec / 86400);
    const hours   = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m  (raw timeticks: ${timeticks})`;
}

function cleanBuffer(val) {
    if (Buffer.isBuffer(val)) return val.toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
    return String(val);
}

async function checkIp(ip) {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  IP: ${ip}`);
    console.log('─'.repeat(55));

    // Bước 1: Ping
    let pingMs = null;
    try {
        const res = await ping.promise.probe(ip, { timeout: 3 });
        if (!res.alive) {
            console.log('  PING     : DOWN — bỏ qua SNMP');
            return { ip, alive: false };
        }
        pingMs = res.time;
        console.log(`  PING     : UP (${pingMs}ms)`);
    } catch (e) {
        console.log(`  PING     : ERROR — ${e.message}`);
        return { ip, alive: false };
    }

    // Bước 2: SNMP GET
    const session = snmp.createSession(ip, COMMUNITY, {
        timeout: 5000,
        retries: 1,
        version: snmp.Version2c,
    });

    const result = await new Promise((resolve) => {
        session.get(Object.values(OIDS), (error, varbinds) => {
            const data = {};
            if (error) {
                console.log(`  SNMP     : FAIL — ${error.message}`);
                console.log('  → Gợi ý: (1) community string đúng chưa?');
                console.log('            (2) SNMP đã bật trên web UI AP chưa?');
                console.log('            (3) Firewall có block UDP/161 không?');
            } else {
                const keys = Object.keys(OIDS);
                varbinds.forEach((vb, i) => {
                    const key = keys[i];
                    if (snmp.isVarbindError(vb)) {
                        console.log(`  ${key.padEnd(12)}: NO DATA`);
                    } else {
                        let val = vb.value;
                        if (key === 'sysUpTime') {
                            data.uptime_sec = Math.floor(val / 100);
                            val = formatUptime(val);
                        } else {
                            val = cleanBuffer(val);
                        }
                        data[key] = val;
                        console.log(`  ${key.padEnd(12)}: ${val}`);
                    }
                });
            }
            session.close();
            resolve(data);
        });
    });

    return { ip, alive: true, ping_ms: pingMs, ...result };
}

async function main() {
    console.log('\n' + '='.repeat(55));
    console.log('  WiFi AP SNMP Connectivity Test');
    console.log(`  Community string : "${COMMUNITY}"`);
    console.log(`  SNMP version     : 2c`);
    console.log(`  Targets (${String(IPS.length).padStart(2)})    : ${IPS.join(', ')}`);
    console.log('='.repeat(55));

    const results = [];
    for (const ip of IPS) {
        const r = await checkIp(ip);
        results.push(r);
    }

    // Tóm tắt
    console.log('\n' + '='.repeat(55));
    console.log('  KẾT QUẢ TỔNG HỢP');
    console.log('='.repeat(55));
    const up   = results.filter(r => r.alive);
    const down = results.filter(r => !r.alive);
    const snmpOk = up.filter(r => r.sysUpTime);

    console.log(`  Online   : ${up.length}/${IPS.length} AP`);
    console.log(`  SNMP OK  : ${snmpOk.length}/${up.length} AP online`);
    if (down.length) console.log(`  Offline  : ${down.map(r => r.ip).join(', ')}`);
    if (snmpOk.length === 0 && up.length > 0) {
        console.log('\n  ⚠ SNMP không lấy được dữ liệu trên bất kỳ AP nào.');
        console.log('  → Kiểm tra community string hoặc bật SNMP trên AP web UI.');
    } else if (snmpOk.length > 0) {
        console.log('\n  ✓ SNMP hoạt động → có thể tích hợp vào service chính thức.');
        console.log('  → Phase tiếp theo: Phase 1 — Database Schema (xem WIFI_MONITORING_PLAN.md)');
    }
    console.log('='.repeat(55) + '\n');
}

main().catch(console.error);
