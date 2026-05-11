# Plan: WiFi AP Monitoring — Tích hợp vào project gasoline_prices

> **Lưu ý AI Agent:** Thực thi theo thứ tự Phase 0 → 7.  
> Mỗi phase có **Verify** rõ ràng — phải PASS trước khi sang phase tiếp theo.  
> Không skip phase, không batch nhiều phase cùng lúc.

---

## ── REFACTOR: Tách DB WiFi ra file riêng (Phase R1 → R5) ──

> **Trạng thái:** Phase 0–7 đã hoàn thành. Phần này mô tả refactor tách  
> `wifi_aps` + `wifi_events` ra khỏi `fuel_data.db` → file `wifi_moni.db` riêng.
>
> **Dữ liệu cần giữ:** 7 APs + 16 events đang có trong `fuel_data.db`.  
> **File duy nhất cần đổi logic:** `wifi.service.js` (đổi import từ `sqlite_db` → `sqlite_wifi_db`).  
> **Models KHÔNG thay đổi** — chúng nhận `db` qua parameter.

### Phạm vi thay đổi tổng thể

| File | Thay đổi |
|------|---------|
| `src/config/db.js` | Thêm `sqlite_wifi_db` connection → `wifi_moni.db`; move CREATE TABLE wifi_* sang db mới; xóa khỏi sqlite_db block |
| `src/services/wifi.service.js` | Đổi `const { sqlite_db }` → `const { sqlite_wifi_db }` + replace all |
| `.env` + `.env.example` | Thêm `WIFI_DB_PATH=./database/wifi_moni.db` |
| `scripts/` | Thêm `migrate_wifi_db.js` — chạy 1 lần để copy data |
| `feature_map/WIFI_MONITORING_FEATURE_MAP.md` | Cập nhật mục Database |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục + .env vars |

---

### Phase R1 — Env var + DB connection mới

**Mục đích:** Tạo connection `sqlite_wifi_db` trỏ vào `wifi_moni.db`.  
**Chưa move tables** — chỉ thêm connection, đảm bảo không vỡ gì.

**`.env`** — thêm:
```
WIFI_DB_PATH=./database/wifi_moni.db
```

**`.env.example`** — thêm (dưới `WIFI_POLL_INTERVAL`):
```
WIFI_DB_PATH=./database/wifi_moni.db
```

**`src/config/db.js`** — thêm sau block `sqlite_db`:
```javascript
const WIFI_DB_PATH = process.env.WIFI_DB_PATH || './database/wifi_moni.db';

const sqlite_wifi_db = new sqlite3.Database(WIFI_DB_PATH, (err) => {
    if (err) {
        console.error('> ERROR: Could not connect to WiFi database:', err.message);
        return;
    }
    console.log('> LOG: Connected to WiFi database -' + WIFI_DB_PATH);
    sqlite_wifi_db.serialize(() => {
        // (tables sẽ được move vào đây ở Phase R2)
    });
});

module.exports = { sqlite_db, sqlite_wifi_db, mssqlConfig, connectMSSQL };
```

#### Verify Phase R1 ✅
```bash
node main.js
# Phải thấy:
#   > LOG: Connected to WiFi database -./database/wifi_moni.db
#   > LOG: Table wifi_aps ready        ← vẫn từ fuel_data.db (chưa move)
ls database/
#   fuel_data.db   wifi_moni.db       ← file mới xuất hiện
```

---

### Phase R2 — Move table creation sang wifi_moni.db

**Mục đích:** Di chuyển `CREATE TABLE wifi_aps` và `wifi_events`  
từ block `sqlite_db.serialize()` sang block `sqlite_wifi_db.serialize()`.

**`src/config/db.js`** — xóa 2 `sqlite_db.run(CREATE TABLE wifi_aps...)` và `sqlite_db.run(CREATE TABLE wifi_events...)` khỏi block `sqlite_db`, thêm vào block `sqlite_wifi_db`:

```javascript
sqlite_wifi_db.serialize(() => {
    sqlite_wifi_db.run(`
        CREATE TABLE IF NOT EXISTS wifi_aps (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT NOT NULL,
            ip               TEXT NOT NULL,
            location         TEXT,
            snmp_community   TEXT DEFAULT 'public',
            snmp_client_oid  TEXT,
            status           TEXT DEFAULT 'active',
            last_status      TEXT DEFAULT 'unknown',
            last_ping_ms     INTEGER,
            last_clients     INTEGER,
            last_uptime_sec  INTEGER,
            last_checked_at  TEXT,
            created_at       TEXT,
            updated_at       TEXT
        )
    `, (e) => {
        if (e) console.error('> ERROR: Could not create wifi_aps table:', e.message);
        else console.log('> LOG: Table wifi_aps ready');
    });

    sqlite_wifi_db.run(`
        CREATE TABLE IF NOT EXISTS wifi_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ap_id       INTEGER NOT NULL,
            event_type  TEXT NOT NULL,
            ping_ms     INTEGER,
            checked_at  TEXT NOT NULL
        )
    `, (e) => {
        if (e) console.error('> ERROR: Could not create wifi_events table:', e.message);
        else console.log('> LOG: Table wifi_events ready');
    });
});
```

#### Verify Phase R2 ✅
```bash
node main.js
# Log thứ tự phải là:
#   > LOG: Connected to SQLite database -./database/fuel_data.db
#   > LOG: Table zkteco_devices ready
#   > LOG: Table zkteco_employees ready       ← wifi tables không còn ở đây
#   > LOG: Connected to WiFi database -./database/wifi_moni.db
#   > LOG: Table wifi_aps ready
#   > LOG: Table wifi_events ready

sqlite3 database/wifi_moni.db ".tables"
#   wifi_aps   wifi_events

sqlite3 database/fuel_data.db ".tables"
#   fuel_prices   users   zkteco_devices   zkteco_employees  ← không có wifi_*
```

---

### Phase R3 — Switch service sang sqlite_wifi_db

**Mục đích:** Đây là thay đổi logic duy nhất — `wifi.service.js` đổi import.

**`src/services/wifi.service.js`** — dòng 5:
```javascript
// Trước:
const { sqlite_db }  = require('../config/db');

// Sau:
const { sqlite_wifi_db } = require('../config/db');
```

Thay toàn bộ `sqlite_db` → `sqlite_wifi_db` trong file (xuất hiện 9 lần):
```
getAll(sqlite_db, ...)       → getAll(sqlite_wifi_db, ...)
getById(sqlite_db, ...)      → getById(sqlite_wifi_db, ...)
insert(sqlite_db, ...)       → insert(sqlite_wifi_db, ...)
update(sqlite_db, ...)       → update(sqlite_wifi_db, ...)
remove(sqlite_db, ...)       → remove(sqlite_wifi_db, ...)
updateStatus(sqlite_db, ...) → updateStatus(sqlite_wifi_db, ...)
insert(sqlite_db, ...)       → insert(sqlite_wifi_db, ...)
getByApId(sqlite_db, ...)    → getByApId(sqlite_wifi_db, ...)
getAll(sqlite_db)            → getAll(sqlite_wifi_db)
```

#### Verify Phase R3 ✅
```bash
node main.js &; sleep 2
TOKEN=$(...)   # lấy token admin

# API phải trả về rỗng (data chưa migrate sang wifi_moni.db)
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/wifi/aps
# {"success":true,"count":0,"aps":[]}  ← đúng, chưa migrate

# Poll không crash
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/wifi/poll
# {"success":true,...}
```

---

### Phase R4 — Migrate data từ fuel_data.db → wifi_moni.db

**Mục đích:** Copy toàn bộ 7 APs + 16 events sang DB mới.  
**Script chạy 1 lần:** `scripts/migrate_wifi_db.js`

```javascript
// scripts/migrate_wifi_db.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const SRC_PATH  = process.env.SQLITE_DB_PATH  || './database/fuel_data.db';
const DEST_PATH = process.env.WIFI_DB_PATH    || './database/wifi_moni.db';

const src  = new sqlite3.Database(SRC_PATH);
const dest = new sqlite3.Database(DEST_PATH);

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve(this); }));
}
function all(db, sql) {
    return new Promise((resolve, reject) => db.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows)));
}

async function migrate() {
    console.log(`Migrating: ${SRC_PATH} → ${DEST_PATH}`);

    const aps     = await all(src, 'SELECT * FROM wifi_aps');
    const events  = await all(src, 'SELECT * FROM wifi_events');
    console.log(`Found: ${aps.length} APs, ${events.length} events`);

    // Insert APs — giữ nguyên id
    for (const ap of aps) {
        await run(dest,
            `INSERT OR IGNORE INTO wifi_aps
             (id,name,ip,location,snmp_community,snmp_client_oid,status,
              last_status,last_ping_ms,last_clients,last_uptime_sec,last_checked_at,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [ap.id,ap.name,ap.ip,ap.location,ap.snmp_community,ap.snmp_client_oid,ap.status,
             ap.last_status,ap.last_ping_ms,ap.last_clients,ap.last_uptime_sec,ap.last_checked_at,
             ap.created_at,ap.updated_at]
        );
    }

    // Insert events — giữ nguyên id
    for (const ev of events) {
        await run(dest,
            `INSERT OR IGNORE INTO wifi_events (id,ap_id,event_type,ping_ms,checked_at)
             VALUES (?,?,?,?,?)`,
            [ev.id,ev.ap_id,ev.event_type,ev.ping_ms,ev.checked_at]
        );
    }

    // Verify
    const [apCount]    = await all(dest, 'SELECT COUNT(*) as c FROM wifi_aps');
    const [eventCount] = await all(dest, 'SELECT COUNT(*) as c FROM wifi_events');
    console.log(`Migrated → ${apCount.c} APs, ${eventCount.c} events`);
    console.log('Done.');
    src.close(); dest.close();
}

migrate().catch(e => { console.error(e); process.exit(1); });
```

**Chạy:**
```bash
node scripts/migrate_wifi_db.js
```

#### Verify Phase R4 ✅
```bash
sqlite3 database/wifi_moni.db "SELECT id, name, ip, last_status FROM wifi_aps;"
# Phải thấy đủ 7 APs

sqlite3 database/wifi_moni.db "SELECT COUNT(*) FROM wifi_events;"
# Phải = 16

# API server trả đúng data
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/wifi/aps | node -e "..."
# count: 7
```

---

### Phase R5 — Docs

**Files cập nhật:**
- `feature_map/WIFI_MONITORING_FEATURE_MAP.md` — mục Database: ghi rõ `wifi_moni.db` tách biệt
- `PROJECT_STRUCTURE.md` — cây thư mục thêm `wifi_moni.db`, .env thêm `WIFI_DB_PATH`

#### Verify Phase R5 ✅
```bash
grep -n "wifi_moni\|WIFI_DB_PATH" PROJECT_STRUCTURE.md
# Phải có ít nhất 3 kết quả
```

---

### Tổng kết thay đổi Refactor

| File | Thay đổi |
|------|---------|
| `src/config/db.js` | +`sqlite_wifi_db` connection; move 2 CREATE TABLE; export thêm |
| `src/services/wifi.service.js` | `sqlite_db` → `sqlite_wifi_db` (1 import + 9 chỗ dùng) |
| `.env` | Thêm `WIFI_DB_PATH=./database/wifi_moni.db` |
| `.env.example` | Thêm `WIFI_DB_PATH=./database/wifi_moni.db` |
| `scripts/migrate_wifi_db.js` | Script chạy 1 lần, giữ nguyên sau khi dùng |
| `feature_map/WIFI_MONITORING_FEATURE_MAP.md` | Cập nhật DB section |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục + .env |

**Files KHÔNG thay đổi:**  
`wifiAp.model.js`, `wifiEvent.model.js`, `wifi.controller.js`, `wifi.routes.js`, `wifi.ejs`, `wifi.css`

---

---

## Context

- **Hạ tầng:** 10+ Altai WiFi AP, subnet `172.16.82.x`, 7 đang up
- **Model xác nhận:** Altai WA8011NAC-X (SuperWifi A8, 4-sector), firmware 2.2.0.1919.HKE46
- **SSID:** MIPEC TERMINAL
- **Server:** Linux + Docker (monitoring server cùng mạng)
- **Giao thức:** Ping (ICMP) + SNMP v2c
- **Phân quyền:** Admin only (giống ZKTeco)
- **Polling:** setInterval 5 phút, cấu hình qua `WIFI_POLL_INTERVAL` trong .env
- **Pattern:** Theo đúng cấu trúc ZKTeco (routes → controller → service → model → EJS view)

## OID đã xác nhận (Phase 0 PASSED)

| Metric | OID | Phương pháp | Ghi chú |
|--------|-----|-------------|---------|
| **Uptime** | `1.3.6.1.2.1.1.3.0` | GET scalar | Timeticks, ÷100 = giây |
| **Client count** | `1.3.6.1.4.1.27586.7.4.2.2.1.6` | **Walk + count(>0)** | Altai active_flag per slot |
| **Client RSSI** | `1.3.6.1.4.1.27586.7.4.2.2.1.19` | Walk | dBm, -96 = empty slot |
| **Model name** | `1.3.6.1.4.1.27586.7.1.1.1.0` | GET scalar | "WA8011NAC-X" |
| **Community** | `public` | — | Xác nhận trên toàn bộ 7 AP |

**Lưu ý quan trọng:**
- `altai.7.3.1.0` = **KHÔNG phải** client count (hằng số = 2 trên mọi AP)
- `altai.7.4.1.10.0` = số slot cấp phát (không = số client active)
- Client count phải dùng **SNMP Walk** không phải GET scalar

**Trạng thái thực tế lúc 2026-05-07:**
| AP | IP | Clients | RSSI |
|----|----|---------|------|
| TC15 | 172.16.82.2 | 1 | -83 dBm |
| TC12 | 172.16.82.3 | 1 | -89 dBm |
| TC08 | 172.16.82.4 | 0 | — |
| TC08 | 172.16.82.5 | 0 | — |
| TC06 | 172.16.82.7 | 1 | -96 dBm (yếu) |
| TC06 | 172.16.82.8 | 0 | — (vừa reboot 6h) |
| Building | 172.16.82.10 | 0 | — |

---

## Phase 0 — SNMP Test Script

> **Mục đích:** Xác nhận SNMP hoạt động trên các Altai AP *trước khi* build feature.  
> **Độc lập:** Không cần Express server, không thay đổi codebase.

### Packages cần cài
```bash
npm install ping net-snmp
```

**`ping` — gói kiểm tra ICMP:**
- Là wrapper thuần JS cho lệnh hệ thống `ping`
- API: `ping.promise.probe(ip, { timeout: 3 })` → `{ alive: bool, time: ms }`
- Không cần quyền root (dùng system ping), hoạt động trên Linux/Mac/Windows
- Nhẹ, không dependency phức tạp

**`net-snmp` — gói SNMP thuần JavaScript:**
- Implement SNMP v1/v2c/v3 hoàn toàn trong Node.js, không cần `snmpd` hay binary ngoài
- API: `snmp.createSession(ip, community, opts)` → `session.get([oids], callback)`
- Hỗ trợ: GET, GETNEXT, SET, WALK, TRAP
- Lý do chọn: thuần JS (dễ deploy), phổ biến, maintained tốt

### File tạo
`scripts/test_snmp_wifi.js` — xem file thực tế trong `scripts/`

### Chạy test
```bash
# Dùng community mặc định "public"
node scripts/test_snmp_wifi.js public

# Chỉ test 1 IP
node scripts/test_snmp_wifi.js public 172.16.82.2

# Dùng community tùy chỉnh
node scripts/test_snmp_wifi.js mystring 172.16.82.2 172.16.82.3
```

### Verify Phase 0 ✅
- [ ] `npm install ping net-snmp` thành công, không lỗi
- [ ] Script chạy không crash
- [ ] Ít nhất 1 AP trả về `sysUpTime` có giá trị → SNMP hoạt động
- [ ] Ghi lại community string thực tế và điền vào `.env` / DB sau

---

## Phase 1 — Database Schema

**Files sửa:** `src/config/db.js`

Thêm 2 bảng vào block `sqlite_db.serialize()`:

```sql
-- Bảng 1: Danh sách AP + trạng thái hiện tại
CREATE TABLE IF NOT EXISTS wifi_aps (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    ip               TEXT NOT NULL,
    location         TEXT,
    snmp_community   TEXT DEFAULT 'public',
    snmp_client_oid  TEXT,           -- OID client count, để trống = bỏ qua
    status           TEXT DEFAULT 'active',
    last_status      TEXT DEFAULT 'unknown',  -- 'up' | 'down' | 'unknown'
    last_ping_ms     INTEGER,
    last_clients     INTEGER,
    last_uptime_sec  INTEGER,
    last_checked_at  TEXT,
    created_at       TEXT,
    updated_at       TEXT
)

-- Bảng 2: Lịch sử sự kiện up/down
CREATE TABLE IF NOT EXISTS wifi_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ap_id       INTEGER NOT NULL,
    event_type  TEXT NOT NULL,       -- 'up' | 'down'
    ping_ms     INTEGER,
    checked_at  TEXT NOT NULL
)
```

### Verify Phase 1 ✅
```bash
node main.js
# Log phải thấy:
#   > LOG: Table wifi_aps ready
#   > LOG: Table wifi_events ready

sqlite3 database/fuel_data.db ".tables"
# Output phải có: wifi_aps   wifi_events
```

---

## Phase 2 — Model Layer

**Files tạo mới:**
- `src/models/wifiAp.model.js` — 6 hàm: `getAll`, `getById`, `insert`, `update`, `remove`, `updateStatus`
- `src/models/wifiEvent.model.js` — 2 hàm: `insert`, `getByApId(limit=50)`

Pattern: promisified SQLite, giống `zkteco.model.js`.

### Verify Phase 2 ✅
- Chạy `node main.js` không crash (require các model không lỗi)
- Test thủ công qua API sẽ verify ở Phase 4

---

## Phase 3 — Service Layer (Ping + SNMP)

**File tạo:** `src/services/wifi.service.js`

```
checkAp(ap):
  1. ping(ap.ip, timeout=3s) → { alive, ping_ms }
  2. Nếu alive && ap.snmp_community:
       SNMP GET sysUpTime (1.3.6.1.2.1.1.3.0) → uptime_sec
       Nếu ap.snmp_client_oid:
           SNMP GET ap.snmp_client_oid → clients
  3. wifiAp.model.updateStatus(db, id, { last_status, ping_ms, clients, uptime_sec })
  4. Nếu status thay đổi (unknown→up, up→down, down→up):
       wifiEvent.model.insert(db, ap_id, event_type, ping_ms)

pollAll():
  → getAll active APs → Promise.all(aps.map(checkAp))

startPolling(intervalMs = 300000):
  → pollAll() ngay lập tức (lần đầu)
  → setInterval(pollAll, intervalMs)
```

### Verify Phase 3 ✅
Tạo script tạm `scripts/test_wifi_service.js`:
```javascript
const { sqlite_db } = require('../src/config/db');
const { checkAp } = require('../src/services/wifi.service');

checkAp({ id: 1, ip: '172.16.82.2', snmp_community: 'public', snmp_client_oid: null })
    .then(result => { console.log('Result:', result); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
```
- [ ] `checkAp()` trả về object có `last_status`, `ping_ms`, `uptime_sec`
- [ ] Xóa script test sau khi verify xong

---

## Phase 4 — Routes + Controller + API

**Files tạo:**
- `src/routes/wifi.routes.js`
- `src/controllers/wifi.controller.js`

**Files sửa:** `src/app.js` (import + mount wifiRouter)

| Method | Route | Mô tả |
|--------|-------|-------|
| `GET` | `/wifi` | Render wifi.ejs |
| `GET` | `/api/wifi/aps` | Danh sách AP + trạng thái |
| `POST` | `/api/wifi/aps` | Thêm AP mới |
| `PUT` | `/api/wifi/aps/:id` | Cập nhật AP |
| `DELETE` | `/api/wifi/aps/:id` | Xóa AP |
| `POST` | `/api/wifi/aps/:id/check` | Check ngay 1 AP |
| `GET` | `/api/wifi/aps/:id/events` | Lịch sử 50 event gần nhất |
| `POST` | `/api/wifi/poll` | Poll tất cả AP ngay |

### Verify Phase 4 ✅
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"xxx"}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/wifi/aps

curl -X POST http://localhost:8000/api/wifi/aps \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"AP-Test","ip":"172.16.82.2","snmp_community":"public"}'

curl -X POST http://localhost:8000/api/wifi/aps/1/check \
  -H "Authorization: Bearer $TOKEN"
```
- [ ] `GET /api/wifi/aps` → 200 + array
- [ ] `POST /api/wifi/aps` → 201 + AP mới có id
- [ ] `POST /api/wifi/aps/1/check` → 200 + `{ last_status, ping_ms, uptime_sec }`
- [ ] `GET /api/wifi/aps/1/events` → 200 + array events

---

## Phase 5 — UI (EJS + CSS)

**Files tạo:**
- `src/views/wifi.ejs`
- `public/css/wifi.css` (dark theme, cùng style ZKTeco)

**Files sửa:** `src/views/menu.ejs` — đổi card "Coming Soon" → active, `href="/wifi"`

**UI layout:**
```
┌──────────────────────────────────────────────────────┐
│ ← Menu   📡 Monitoring WiFi AP                       │ sticky header
└──────────────────────────────────────────────────────┘

[Form: Thêm/Sửa AP — Tên, IP, Vị trí, SNMP Community, OID Client]

┌──────────────────────────────────────────────────────┐
│ 📡 Danh sách AP   [🔄 Poll tất cả] [🔄 Làm mới]     │
│ Tên | IP | Vị trí | Status     | Ping | Client|Uptime│
│ AP1 | .2 | Tầng 1 | 🟢 Online  | 12ms | 5     | 2d3h │
│ AP6 | .6 | Tầng 2 | 🔴 Offline | —    | —     | —    │
│           [📶 Check] [📋 Lịch sử] [✏️ Sửa] [🗑️ Xóa]│
└──────────────────────────────────────────────────────┘

[Modal: Lịch sử — AP-Floor1]
  Thời gian           | Sự kiện  | Ping
  2026-05-07 10:30:00 | 🔴 Down  | —
  2026-05-07 08:15:00 | 🟢 Up    | 15ms
```

Auto-refresh: `setInterval(fetchAndRenderTable, 30000)` — cập nhật bảng không reload trang.

### Verify Phase 5 ✅
- [ ] `http://localhost:8000/menu` → card "Monitoring hệ thống" active, click được
- [ ] `http://localhost:8000/wifi` → trang load, hiển thị bảng AP
- [ ] Thêm AP qua form → xuất hiện trong bảng
- [ ] Click "Check ngay" → status cập nhật
- [ ] Click "Lịch sử" → modal hiện events

---

## Phase 6 — Background Polling

**File sửa:** `src/server.js`

```javascript
const { startPolling } = require('./services/wifi.service');
const WIFI_POLL_INTERVAL = parseInt(process.env.WIFI_POLL_INTERVAL) || 300000;

connectMSSQL();
startPolling(WIFI_POLL_INTERVAL);   // thêm dòng này
```

**File sửa:** `.env.example` — thêm `WIFI_POLL_INTERVAL=300000`

### Verify Phase 6 ✅
```bash
node main.js
# Log phải thấy: > LOG: WiFi polling started (interval: 300000ms)
# Sau vài phút:  > LOG: WiFi poll complete — X APs checked
```
- [ ] Chờ 5 phút → `last_checked_at` trong DB cập nhật
- [ ] Nếu 1 AP down → `wifi_events` có record mới

---

## Phase 7 — Docs

**Files tạo/sửa:**
- `feature_map/WIFI_MONITORING_FEATURE_MAP.md` — tạo mới (theo pattern ZKTECO_FEATURE_MAP.md)
- `PROJECT_STRUCTURE.md` — cập nhật cây thư mục, API endpoints, Dependencies, .env vars

### Verify Phase 7 ✅
- [ ] Feature map đủ các mục: Tổng quan, Bản đồ file, Database, API, Luồng dữ liệu, UI
- [ ] PROJECT_STRUCTURE.md phản ánh đúng cây thư mục hiện tại

---

## Packages sẽ thêm vào package.json

| Package | Version | Dùng cho |
|---------|---------|----------|
| `ping` | `^0.4.4` | ICMP ping check per AP |
| `net-snmp` | `^3.11.3` | SNMP v2c GET sysUpTime + OID client count |

---

## Files tổng hợp

### Tạo mới (9 files)
```
scripts/test_snmp_wifi.js              ← Phase 0 (đã có)
src/routes/wifi.routes.js              ← Phase 4
src/controllers/wifi.controller.js     ← Phase 4
src/services/wifi.service.js           ← Phase 3
src/models/wifiAp.model.js             ← Phase 2
src/models/wifiEvent.model.js          ← Phase 2
src/views/wifi.ejs                     ← Phase 5
public/css/wifi.css                    ← Phase 5
feature_map/WIFI_MONITORING_FEATURE_MAP.md  ← Phase 7
```

### Sửa đổi (6 files)
```
src/config/db.js          ← Phase 1: 2 CREATE TABLE IF NOT EXISTS
src/app.js                ← Phase 4: import + mount wifiRouter + GET /wifi route
src/server.js             ← Phase 6: startPolling() sau connectMSSQL()
src/views/menu.ejs        ← Phase 5: activate card "Monitoring hệ thống"
PROJECT_STRUCTURE.md      ← Phase 7: cập nhật toàn bộ
.env.example              ← Phase 6: thêm WIFI_POLL_INTERVAL
```
