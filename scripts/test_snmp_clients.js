// scripts/test_snmp_clients.js
// Mục đích: Xác minh OID client count + signal trên Altai SuperWifi WA8011NAC-X
// Chạy trên nhiều AP để đối chiếu kết quả
//
// Usage: node scripts/test_snmp_clients.js [community] [ip1] [ip2] ...

const snmp = require('net-snmp');
const ping = require('ping');

const COMMUNITY = process.argv[2] || 'public';
const IPS = process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : ['172.16.82.2','172.16.82.3','172.16.82.4','172.16.82.5',
       '172.16.82.7','172.16.82.8','172.16.82.10'];

// OIDs đã xác định từ walk
const OID = {
    // Scalar — thử làm client count candidate
    candidate_count:  '1.3.6.1.4.1.27586.7.3.1.0',
    station_tbl_size: '1.3.6.1.4.1.27586.7.4.1.10.0',

    // Cột "active flag" trong bảng station — walk + count > 0
    station_active_col:  '1.3.6.1.4.1.27586.7.4.2.2.1.6',
    // Cột RSSI per client — walk, value -96 = empty slot
    station_rssi_col:    '1.3.6.1.4.1.27586.7.4.2.2.1.19',
    // Cột TX frames per client
    station_tx_col:      '1.3.6.1.4.1.27586.7.4.2.2.1.7',
};

function snmpGet(session, oids) {
    return new Promise((resolve) => {
        session.get(oids, (err, varbinds) => {
            if (err) return resolve({});
            const result = {};
            oids.forEach((oid, i) => {
                const vb = varbinds[i];
                result[oid] = snmp.isVarbindError(vb) ? null : vb.value;
            });
            resolve(result);
        });
    });
}

function snmpWalk(session, oid) {
    return new Promise((resolve) => {
        const rows = [];
        session.subtree(oid, 10, (varbinds) => {
            varbinds.forEach(vb => {
                if (!snmp.isVarbindError(vb)) rows.push(vb.value);
            });
        }, () => resolve(rows));
    });
}

async function checkAp(ip) {
    const pingRes = await ping.promise.probe(ip, { timeout: 3 });
    if (!pingRes.alive) {
        return { ip, alive: false };
    }

    const session = snmp.createSession(ip, COMMUNITY, {
        timeout: 6000, retries: 1, version: snmp.Version2c,
    });

    // GET 2 scalar candidates
    const scalars = await snmpGet(session, [OID.candidate_count, OID.station_tbl_size]);

    // Walk bảng active flag — đếm entries > 0
    const activeFlags = await snmpWalk(session, OID.station_active_col);
    const activeCount = activeFlags.filter(v => Number(v) > 0).length;

    // Walk bảng RSSI — lấy signal per client
    const rssiList = await snmpWalk(session, OID.station_rssi_col);
    const activeRssi = rssiList.filter(v => Number(v) > -96 && Number(v) < 0);

    // Walk bảng TX frames — xác nhận traffic có thật
    const txList = await snmpWalk(session, OID.station_tx_col);

    session.close();

    return {
        ip,
        alive:           true,
        ping_ms:         pingRes.time,
        candidate_count: scalars[OID.candidate_count],    // giá trị altai.7.3.1.0
        station_tbl_size:scalars[OID.station_tbl_size],   // giá trị altai.7.4.1.10.0
        active_by_flag:  activeCount,                     // count(active_flag > 0)
        active_by_rssi:  activeRssi.length,               // count(rssi > -96)
        rssi_values:     activeRssi,                      // RSSI từng client (dBm)
        tx_values:       txList.filter(v => Number(v) > 0),
    };
}

async function main() {
    console.log('\n' + '='.repeat(65));
    console.log('  Altai SuperWifi — Xác minh OID Client Count');
    console.log(`  Community: "${COMMUNITY}" | Targets: ${IPS.join(', ')}`);
    console.log('='.repeat(65));

    const results = [];
    for (const ip of IPS) {
        process.stdout.write(`\n  Checking ${ip}... `);
        const r = await checkAp(ip);
        results.push(r);

        if (!r.alive) {
            console.log('DOWN');
            continue;
        }

        console.log(`UP (${r.ping_ms}ms)`);
        console.log(`    altai.7.3.1.0 (candidate scalar) = ${r.candidate_count}`);
        console.log(`    altai.7.4.1.10.0 (tbl size)      = ${r.station_tbl_size}`);
        console.log(`    count(active_flag > 0)           = ${r.active_by_flag}  ← đếm từ walk`);
        console.log(`    count(rssi > -96)                = ${r.active_by_rssi}  ← đếm từ RSSI`);
        if (r.rssi_values.length > 0) {
            console.log(`    RSSI per client: ${r.rssi_values.map(v => v + 'dBm').join(', ')}`);
        }
    }

    // So sánh các phương pháp
    console.log('\n' + '='.repeat(65));
    console.log('  SO SÁNH PHƯƠNG PHÁP — mỗi AP:');
    console.log('  IP         | 7.3.1.0 | tbl_size | flag>0 | rssi>-96');
    console.log('  ' + '-'.repeat(60));
    results.filter(r => r.alive).forEach(r => {
        const ip   = r.ip.padEnd(14);
        const c1   = String(r.candidate_count  ?? '-').padEnd(9);
        const c2   = String(r.station_tbl_size ?? '-').padEnd(10);
        const c3   = String(r.active_by_flag).padEnd(8);
        const c4   = String(r.active_by_rssi);
        console.log(`  ${ip}| ${c1}| ${c2}| ${c3}| ${c4}`);
    });

    console.log('\n  KẾT LUẬN:');
    console.log('  → Cột nào nhất quán nhất giữa các AP = OID đúng cho client count');
    console.log('  → Nếu "flag>0" = "rssi>-96" trên tất cả AP → dùng walk approach');
    console.log('  → Nếu "7.3.1.0" khớp với "flag>0" → dùng scalar (đơn giản hơn)');
    console.log('='.repeat(65) + '\n');
}

main().catch(console.error);
