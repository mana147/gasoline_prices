# WIFI_MONITORING_FEATURE_MAP.md

Tài liệu này mô tả toàn bộ phạm vi tác động của tính năng **Monitoring WiFi AP** — dành cho AI agents hoặc developer cần hiểu nhanh feature này tác động đến những gì trong codebase.

---

## Tổng quan tính năng

| Mục | Nội dung |
|-----|---------|
| Tên tính năng | Monitoring WiFi AP (ping + SNMP) |
| Route UI | `GET /wifi` |
| Phân quyền | Admin only (tất cả API đều yêu cầu `authMiddleware + adminMiddleware`) |
| Thư viện ngoài | `ping ^0.4.4`, `net-snmp ^3.11.3` |
| Database | SQLite riêng — `database/wifi_moni.db` (tách khỏi `fuel_data.db`) |
| Giao thức check | Ping (ICMP) + SNMP v2c |
| Polling | `setInterval` trong `server.js`, mặc định 300000ms (5 phút) |
| Model AP đã test | Altai WA8011NAC-X (SuperWifi A8) |

---

## Bản đồ file

### File mới tạo

```
gasoline_prices/
├── scripts/
│   ├── test_snmp_wifi.js           ← Test ping + SNMP GET cơ bản (Phase 0)
│   ├── test_snmp_walk.js           ← Walk MIB sâu để khám phá OID (Phase 0)
│   └── test_snmp_clients.js        ← Xác minh OID client count (Phase 0)
│
├── src/
│   ├── routes/
│   │   └── wifi.routes.js          ← 7 routes: CRUD + check + events + poll
│   ├── controllers/
│   │   └── wifi.controller.js      ← 7 handlers
│   ├── services/
│   │   └── wifi.service.js         ← checkAp, pollAll, startPolling + CRUD wrappers
│   ├── models/
│   │   ├── wifiAp.model.js         ← SQLite CRUD wifi_aps (6 hàm promisified)
│   │   └── wifiEvent.model.js      ← SQLite INSERT/SELECT wifi_events (2 hàm)
│   └── views/
│       └── wifi.ejs                ← UI: bảng AP + form CRUD + modal lịch sử
│
├── public/css/
│   └── wifi.css                    ← Dark theme, pulse animation dot, modal
│
├── brainstorm_idea/
│   ├── info_WiFi.md                ← Kết quả nmap scan AP ban đầu
│   ├── WIFI_MONITORING_PLAN.md     ← Plan phân phase (Phase 0–7)
│   └── test_wifi.md                ← Runbook khám phá SNMP OID cho model mới
│
└── feature_map/
    └── WIFI_MONITORING_FEATURE_MAP.md  ← File này
```

### File được sửa

| File | Thay đổi |
|------|---------|
| `src/config/db.js` | Thêm `sqlite_wifi_db` connection → `wifi_moni.db`; CREATE TABLE `wifi_aps` + `wifi_events` trong DB riêng |
| `src/app.js` | Import `wifiRouter`; mount `app.use('/', wifiRouter)`; thêm `GET /wifi` route |
| `src/server.js` | Import `startPolling`; gọi `startPolling(WIFI_POLL_INTERVAL)` sau `connectMSSQL()` |
| `src/views/menu.ejs` | Card "Coming Soon" → active link `href="/wifi"`, icon 📡 |
| `.env.example` | Thêm `WIFI_POLL_INTERVAL=300000` |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục, API, DB, Dependencies |

---

## Database — SQLite riêng (`wifi_moni.db`)

> Bảng được tạo tự động tại startup trong connection `sqlite_wifi_db` (`src/config/db.js`).  
> File tách biệt hoàn toàn khỏi `fuel_data.db` — cấu hình qua env var `WIFI_DB_PATH`.

### Bảng `wifi_aps`

| Cột | Kiểu | Default | Mô tả |
|-----|------|---------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Primary key |
| `name` | TEXT | — | Tên AP (bắt buộc) |
| `ip` | TEXT | — | Địa chỉ IP (bắt buộc, validate regex) |
| `location` | TEXT | NULL | Vị trí đặt AP |
| `snmp_community` | TEXT | `'public'` | SNMP community string |
| `snmp_client_oid` | TEXT | NULL | OID walk để đếm client (để trống = bỏ qua) |
| `status` | TEXT | `'active'` | `active` hoặc `inactive` |
| `last_status` | TEXT | `'unknown'` | `up` \| `down` \| `unknown` |
| `last_ping_ms` | INTEGER | NULL | Ping round-trip time (ms) |
| `last_clients` | INTEGER | NULL | Số client đang kết nối |
| `last_uptime_sec` | INTEGER | NULL | Uptime tính bằng giây |
| `last_checked_at` | TEXT | NULL | ISO timestamp lần check gần nhất |
| `created_at` | TEXT | — | ISO timestamp |
| `updated_at` | TEXT | — | ISO timestamp |

### Bảng `wifi_events`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INTEGER | PK AUTOINCREMENT |
| `ap_id` | INTEGER | FK → wifi_aps.id |
| `event_type` | TEXT | `'up'` hoặc `'down'` |
| `ping_ms` | INTEGER | Ping ms lúc xảy ra sự kiện (NULL nếu down) |
| `checked_at` | TEXT | ISO timestamp |

---

## API Endpoints

| Method | Route | Handler | Mô tả |
|--------|-------|---------|-------|
| `GET` | `/wifi` | `app.js` render | Render wifi.ejs |
| `GET` | `/api/wifi/aps` | `getAps` | Danh sách tất cả AP + trạng thái hiện tại |
| `POST` | `/api/wifi/aps` | `addAp` | Thêm AP mới |
| `PUT` | `/api/wifi/aps/:id` | `editAp` | Cập nhật cấu hình AP |
| `DELETE` | `/api/wifi/aps/:id` | `removeAp` | Xóa AP |
| `POST` | `/api/wifi/aps/:id/check` | `checkAp` | Check ngay 1 AP (ping + SNMP), cập nhật DB |
| `GET` | `/api/wifi/aps/:id/events` | `getEvents` | Lịch sử 50 sự kiện gần nhất |
| `POST` | `/api/wifi/poll` | `pollAll` | Trigger poll tất cả AP ngay (non-blocking) |

**Auth header tất cả API:** `Authorization: Bearer <token>` — Admin only

---

## Luồng dữ liệu (Request Flow)

### CRUD AP
```
Client (wifi.ejs JS fetch)
  → POST/PUT/DELETE /api/wifi/aps[/:id]
  → wifi.routes.js  [authMiddleware → adminMiddleware]
  → wifi.controller.js  (parse body)
  → wifi.service.js     (validateApFields: name+ip bắt buộc, IP regex)
  → wifiAp.model.js     (db.run/db.get → SQLite wifi_aps)
  → res.json({ success, ap })
```

### Check 1 AP (manual hoặc từ polling)
```
POST /api/wifi/aps/:id/check  hoặc  startPolling → pollAll → checkAp(ap)
  → wifi.service.checkAp(ap)
      1. ping.promise.probe(ip, { timeout:3 }) → { alive, ping_ms }
      2. Nếu alive && snmp_community:
           snmp.createSession(ip, community, { version: v2c })
           session.get(['1.3.6.1.2.1.1.3.0']) → uptime_sec
           Nếu snmp_client_oid:
               session.subtree(snmp_client_oid) → count(value > 0) = clients
      3. wifiAp.model.updateStatus(db, id, { last_status, ping_ms, clients, uptime_sec })
      4. Nếu last_status thay đổi:
           wifiEvent.model.insert(db, { ap_id, event_type, ping_ms })
           console.log "AP X — old → new"
  → res.json({ status, ping_ms, uptime_sec, clients })
```

### Background polling
```
server.js startup:
  → startPolling(WIFI_POLL_INTERVAL=300000ms)
      → pollAll() ngay lập tức (lần đầu)
      → setInterval(pollAll, 300000)

pollAll():
  → wifiAp.model.getAll(db) filter status='active'
  → Promise.allSettled(aps.map(checkAp))   ← song song
  → log "WiFi poll complete — X APs checked"
```

### Xem lịch sử (modal UI)
```
Client click "📋 Lịch sử"
  → GET /api/wifi/aps/:id/events
  → wifi.controller.getEvents
  → wifi.service.getApEvents(id)
  → wifiEvent.model.getByApId(db, id, 50)   ← SELECT, ORDER BY checked_at DESC
  → res.json({ events })
  → UI render modal table
```

---

## SNMP OID đã xác nhận — Altai WA8011NAC-X

| Metric | OID | Phương pháp |
|--------|-----|-------------|
| Uptime | `1.3.6.1.2.1.1.3.0` | GET scalar (timeticks ÷ 100 = giây) |
| Client count | `1.3.6.1.4.1.27586.7.4.2.2.1.6` | Walk + count(value > 0) |
| Client RSSI | `1.3.6.1.4.1.27586.7.4.2.2.1.19` | Walk (dBm, -96 = empty slot) |

> Cho model AP khác: xem `brainstorm_idea/test_wifi.md` để biết quy trình khám phá OID.

---

## UI (wifi.ejs)

### Layout
```
┌────────────────────────────────────────────────────────┐
│ ← Menu   📡 Monitoring WiFi AP                         │  sticky header
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 📡 Thêm AP mới  [+ Thêm AP mới]                        │  form card
│   [Tên*] [IP*] [Vị trí] [Community] [OID Client]       │  (ẩn/hiện)
│   [Thêm AP]  [Hủy]   <message>                         │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ 📶 Danh sách AP  Cập nhật lúc HH:MM  [⚡Poll] [🔄]    │  table card
│ Tên | IP | Trạng thái  | Ping | Client | Uptime | Lúc  │
│ TC15| .2 | 🟢 Online   | 0.4ms|   1    | 27.3d  | ...  │
│ TC08| .4 | 🟢 Online   | 0.5ms|   0    | 147d   | ...  │
│     Thao tác: [📶 Check] [📋 Lịch sử] [✏️ Sửa] [🗑️]  │
└────────────────────────────────────────────────────────┘

[Modal: Lịch sử — TC15]
  Thời gian           | Sự kiện    | Ping
  2026-05-07 09:16:00 | 🟢 Online  | 0.4ms
```

### Tính năng UI
- **Auto-refresh** `setInterval(loadAps, 30000)` — cập nhật bảng mỗi 30 giây
- **Pulse animation** — dot xanh nhấp nháy khi AP online
- **Modal lịch sử** — overlay click-outside để đóng
- **Auth check** DOMContentLoaded → `/api/me` → redirect nếu không phải admin

---

## Phụ thuộc & Ràng buộc quan trọng

| Mục | Chi tiết |
|-----|---------|
| SNMP client count | Phải dùng **Walk** (không có scalar đáng tin trên Altai) |
| `snmp_client_oid` trống | Service bỏ qua bước SNMP walk, `last_clients = null` |
| Polling non-blocking | `POST /api/wifi/poll` trả về ngay, poll chạy ngầm |
| Event log | Chỉ ghi khi status **thay đổi** (unknown→up, up→down, down→up) |
| SNMP session | Luôn `session.close()` trong `finally` block |
| Firmware AP | Altai WA8011NAC-X firmware 2019 — OID ổn định |

---

## Các file KHÔNG bị tác động

Tính năng này **không sửa** các file sau:

- `src/routes/auth.routes.js`, `fuel.routes.js`, `rate.routes.js`, `zkteco.routes.js`
- `src/controllers/auth.controller.js`, `fuel.controller.js`, `rate.controller.js`, `zkteco.controller.js`
- `src/services/fuel.service.js`, `rate.service.js`, `zkteco.service.js`
- `src/models/user.model.js`, `fuelPrice.model.js`, `rate.model.js`, `zkteco.model.js`, `zkEmployee.model.js`
- `src/middleware/auth.js`, `errorHandler.js`
- `src/handle/calculator_gasoline.js`
- `src/views/index.ejs`, `login.ejs`, `zkteco.ejs`, `zkteco_device.ejs`
- `src/server.js` schema — bảng mới tạo tự động, không sửa schema cũ
- `public/css/index.css`, `login.css`, `menu.css`, `zkteco.css`, `zkteco_device.css`
