const snmp = require('net-snmp');
const ping = require('ping');
const wifiApModel    = require('../models/wifiAp.model');
const wifiEventModel = require('../models/wifiEvent.model');
const { sqlite_wifi_db } = require('../config/db');

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const OID_UPTIME = '1.3.6.1.2.1.1.3.0';

// ─── Validation ───────────────────────────────────────────────────────────────

function validateApFields({ name, ip }) {
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
}

// ─── SNMP helpers ─────────────────────────────────────────────────────────────

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

function snmpWalkCount(session, oid) {
    return new Promise((resolve) => {
        let count = 0;
        session.subtree(oid, 10, (varbinds) => {
            varbinds.forEach(vb => {
                if (!snmp.isVarbindError(vb) && Number(vb.value) > 0) count++;
            });
        }, () => resolve(count));
    });
}

// ─── Core check ───────────────────────────────────────────────────────────────

async function checkAp(ap) {
    // 1. Ping
    let alive = false;
    let ping_ms = null;
    try {
        const res = await ping.promise.probe(ap.ip, { timeout: 3 });
        alive   = res.alive;
        ping_ms = res.alive ? res.time : null;
    } catch (_) { /* network error → treat as down */ }

    const new_status = alive ? 'up' : 'down';

    let uptime_sec = null;
    let clients    = null;

    // 2. SNMP (chỉ khi ping UP và có community)
    if (alive && ap.snmp_community) {
        const session = snmp.createSession(ap.ip, ap.snmp_community, {
            timeout: 5000,
            retries: 1,
            version: snmp.Version2c,
        });
        try {
            // Uptime — OID chuẩn MIB-II, luôn thử
            const vals = await snmpGet(session, [OID_UPTIME]);
            if (vals[OID_UPTIME] != null) {
                uptime_sec = Math.floor(vals[OID_UPTIME] / 100);
            }

            // Client count — walk OID cấu hình per-AP (Altai: 1.3.6.1.4.1.27586.7.4.2.2.1.6)
            if (ap.snmp_client_oid) {
                clients = await snmpWalkCount(session, ap.snmp_client_oid);
            }
        } catch (_) { /* SNMP fail — vẫn ghi status từ ping */ }
        finally {
            session.close();
        }
    }

    // 3. Cập nhật trạng thái vào DB
    await wifiApModel.updateStatus(sqlite_wifi_db, ap.id, {
        last_status:     new_status,
        last_ping_ms:    ping_ms,
        last_clients:    clients,
        last_uptime_sec: uptime_sec,
    });

    // 4. Ghi event chỉ khi status thay đổi
    if (ap.last_status !== new_status) {
        await wifiEventModel.insert(sqlite_wifi_db, {
            ap_id:      ap.id,
            event_type: new_status,
            ping_ms,
        });
        console.log(`> LOG: WiFi AP ${ap.name} (${ap.ip}) — ${ap.last_status} → ${new_status}`);
    }

    return { ip: ap.ip, name: ap.name, status: new_status, ping_ms, uptime_sec, clients };
}

// ─── Poll all active APs ───────────────────────────────────────────────────────

async function pollAll() {
    let aps = [];
    try {
        const all = await wifiApModel.getAll(sqlite_wifi_db);
        aps = all.filter(ap => ap.status === 'active');
    } catch (err) {
        console.error('> ERROR: WiFi pollAll failed to load APs:', err.message);
        return;
    }

    if (aps.length === 0) return;

    const results = await Promise.allSettled(aps.map(ap => checkAp(ap)));
    const failed  = results.filter(r => r.status === 'rejected').length;
    console.log(`> LOG: WiFi poll complete — ${aps.length} APs checked${failed ? `, ${failed} error(s)` : ''}`);
}

// ─── Background polling ────────────────────────────────────────────────────────

function startPolling(intervalMs = 300000) {
    console.log(`> LOG: WiFi polling started (interval: ${intervalMs}ms)`);
    pollAll();
    setInterval(pollAll, intervalMs);
}

// ─── CRUD wrappers (dùng bởi controller) ─────────────────────────────────────

async function getAps() {
    return wifiApModel.getAll(sqlite_wifi_db);
}

async function getApById(id) {
    const ap = await wifiApModel.getById(sqlite_wifi_db, id);
    if (!ap) {
        const err = new Error('Không tìm thấy AP');
        err.status = 404;
        throw err;
    }
    return ap;
}

async function createAp({ name, ip, location, snmp_community, snmp_client_oid }) {
    validateApFields({ name, ip });
    const id = await wifiApModel.insert(sqlite_wifi_db, { name, ip, location, snmp_community, snmp_client_oid });
    return wifiApModel.getById(sqlite_wifi_db, id);
}

async function updateAp(id, fields) {
    await getApById(id);
    if (fields.ip !== undefined) validateApFields({ name: fields.name || 'x', ip: fields.ip });
    const changed = await wifiApModel.update(sqlite_wifi_db, id, fields);
    if (!changed) {
        const err = new Error('Không tìm thấy AP');
        err.status = 404;
        throw err;
    }
    return wifiApModel.getById(sqlite_wifi_db, id);
}

async function deleteAp(id) {
    await getApById(id);
    return wifiApModel.remove(sqlite_wifi_db, id);
}

async function checkApNow(id) {
    const ap = await getApById(id);
    return checkAp(ap);
}

async function getApEvents(id, limit = 50) {
    await getApById(id);
    return wifiEventModel.getByApId(sqlite_wifi_db, id, limit);
}

module.exports = {
    startPolling,
    pollAll,
    checkApNow,
    getAps,
    getApById,
    createAp,
    updateAp,
    deleteAp,
    getApEvents,
};
