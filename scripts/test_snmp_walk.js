// scripts/test_snmp_walk.js
// Mục đích: Walk SNMP sâu vào Altai Enterprise MIB để tìm OID client count
//
// Usage: node scripts/test_snmp_walk.js [ip] [community]
// Ví dụ: node scripts/test_snmp_walk.js 172.16.82.2 public

const snmp = require('net-snmp');

const IP        = process.argv[2] || '172.16.82.2';
const COMMUNITY = process.argv[3] || 'public';

// Altai Enterprise OID prefix: 1.3.6.1.4.1.27586
// Các nhánh cần khám phá để tìm client/station table
const WALK_TARGETS = [
    {
        oid:     '1.3.6.1.4.1.27586.7.2',
        desc:    'Altai 7.2 — Radio statistics / Station info',
        maxRows: 200,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.3',
        desc:    'Altai 7.3 — Unknown (likely client table)',
        maxRows: 200,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.4',
        desc:    'Altai 7.4 — Unknown',
        maxRows: 100,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.5',
        desc:    'Altai 7.5 — Unknown',
        maxRows: 100,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.1.3',
        desc:    'Altai 7.1.3 — System sub-section (radio config?)',
        maxRows: 100,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.1.4',
        desc:    'Altai 7.1.4 — System sub-section',
        maxRows: 100,
    },
    {
        oid:     '1.3.6.1.4.1.27586.7.1.5',
        desc:    'Altai 7.1.5 — System sub-section',
        maxRows: 100,
    },
];

function walkBranch(session, oid, maxRows) {
    return new Promise((resolve) => {
        const rows  = [];
        let   count = 0;

        session.subtree(oid, 20, (varbinds) => {
            for (const vb of varbinds) {
                if (snmp.isVarbindError(vb)) continue;
                let val = vb.value;
                if (Buffer.isBuffer(val)) {
                    const str = val.toString('utf8').replace(/[^\x20-\x7E]/g, '').trim();
                    val = str.length > 2 ? str : `[hex ${val.length}B] ${val.toString('hex').slice(0, 24)}`;
                }
                rows.push({ oid: vb.oid, val: String(val) });
                count++;
                if (count >= maxRows) return true; // stop walk
            }
        }, (err) => {
            if (err) rows.push({ oid: '(error)', val: err.message });
            resolve(rows);
        });
    });
}

function printRows(rows, maxRows) {
    if (rows.length === 0) {
        console.log('  (no data — nhánh này không tồn tại)');
        return;
    }
    rows.forEach(r => {
        // Rút gọn OID prefix Altai cho dễ đọc
        const short = r.oid
            .replace('1.3.6.1.4.1.27586.', 'altai.')
            .replace('1.3.6.1.2.1.', 'mib2.');
        console.log(`  ${short.padEnd(45)} : ${r.val}`);
    });
    if (rows.length >= maxRows) {
        console.log(`  ... (giới hạn ${maxRows} dòng, có thể còn nhiều hơn)`);
    }
}

async function main() {
    console.log('\n' + '='.repeat(65));
    console.log(`  Altai Enterprise MIB Deep Walk`);
    console.log(`  IP: ${IP}  |  Community: "${COMMUNITY}"`);
    console.log(`  Mục tiêu: tìm OID client count trên Altai WA8011NAC-X`);
    console.log('='.repeat(65));

    const session = snmp.createSession(IP, COMMUNITY, {
        timeout: 10000,
        retries: 1,
        version: snmp.Version2c,
    });

    for (const target of WALK_TARGETS) {
        console.log(`\n${'─'.repeat(65)}`);
        console.log(`  [${target.desc}]`);
        console.log(`  OID: ${target.oid}`);
        console.log('─'.repeat(65));
        const rows = await walkBranch(session, target.oid, target.maxRows);
        printRows(rows, target.maxRows);
    }

    session.close();

    console.log('\n' + '='.repeat(65));
    console.log('  PHÂN TÍCH:');
    console.log('  → Tìm OID dạng scalar (kết thúc .0) có giá trị = số client');
    console.log('  → Hoặc tìm table có nhiều dòng, mỗi dòng = 1 client (MAC, IP, signal)');
    console.log('  → Lưu OID đó vào snmp_client_oid trong DB');
    console.log('='.repeat(65) + '\n');
}

main().catch(console.error);
