# WINDOWS SERVER MONITORING — EXECUTION PLAN (Phased)

Tài liệu này chia plan tổng (đã chốt với user) thành các **phase độc lập** để
nhiều AI agent có thể làm song song hoặc kế tiếp. Mỗi phase đều ghi rõ:

- **Goal**: mục tiêu rõ ràng
- **Prerequisites**: phase nào phải xong trước
- **Files**: file tạo / sửa
- **Reference**: file đã có trong codebase để mirror
- **Verification**: cách verify trước khi qua phase tiếp theo
- **Handoff**: thông tin gửi sang phase sau

Plan tổng gốc: xem `~/.claude/plans/claude-md-project-structure-md-t-i-ang-parsed-fern.md`.
Test script kiểm tra môi trường: [scripts/test_ssh_windows.js](../scripts/test_ssh_windows.js).
Hướng dẫn cài OpenSSH: [OPENSSH_WINDOWS_SETUP.md](OPENSSH_WINDOWS_SETUP.md).

---

## Bảng phụ thuộc các phase

```
Phase 0 (Pre-flight) ── chặn tất cả ──┐
                                       ▼
Phase 1 (Deps + DB) ──┬─► Phase 2 (Models) ──┐
                      │                       ▼
                      └────────► Phase 3 (Service) ──┐
                                                      ▼
                                  Phase 4 (Controllers + Routes) ──┐
                                                                    ▼
            Phase 5 (App wiring) + Phase 6 (View + CSS) — song song
                                                                    ▼
                                  Phase 7 (Menu + .env + docs)
                                                                    ▼
                                  Phase 8 (E2E test)
```

Phase 5, 6 có thể chạy song song. Các phase còn lại tuần tự.

---

## PHASE 0 — Pre-flight: Verify môi trường

**Goal**: Đảm bảo có ít nhất 1 Windows server cài OpenSSH và Node.js script
test pass trước khi viết bất cứ dòng code nào của feature.

**Prerequisites**: không có.

**Tasks**:
1. Đọc [brainstorm_idea/OPENSSH_WINDOWS_SETUP.md](OPENSSH_WINDOWS_SETUP.md), làm theo Bước 1–6 trên (ít nhất) 1 Windows server.
2. Trên máy dev, cài `ssh2`:
   ```bash
   npm install ssh2
   ```
3. Chạy test:
   ```bash
   node scripts/test_ssh_windows.js <host> <username> <password>
   ```
4. Phải thấy dòng `[DONE] ✅ Môi trường đã sẵn sàng.`

**Files**: không tạo file mới ngoài việc `package.json` đã có `ssh2` (do `npm install`).

**Verification**:
- Test script in đầy đủ CPU / RAM / Disks.
- `cat package.json | grep ssh2` thấy `"ssh2"` trong `dependencies`.

**Handoff cho phase sau**:
- Ghi lại 1 cặp credentials (host, username, password) hoạt động để dùng trong Phase 8 E2E test.
- Confirm version Node.js, OS Windows, ssh2 version dùng (để debug nếu có lỗi).

**Nếu FAIL**: KHÔNG được tiếp tục. Phải debug môi trường trước. Tham khảo bảng
Troubleshooting trong `OPENSSH_WINDOWS_SETUP.md`.

---

## PHASE 1 — Dependencies & Database Layer

**Goal**: Thêm DB connection mới (`sqlite_windows_db`) và tạo 2 bảng SQLite
`windows_servers`, `windows_events` qua `CREATE TABLE IF NOT EXISTS`.

**Prerequisites**: Phase 0 done.

**Files SỬA**:
- [src/config/db.js](../src/config/db.js)
  - Thêm `WINDOWS_DB_PATH` từ `process.env` (default `./database/windows_moni.db`).
  - Tạo `sqlite_windows_db = new sqlite3.Database(WINDOWS_DB_PATH, ...)`.
  - Trong `.serialize()`: `CREATE TABLE IF NOT EXISTS windows_servers (...)` và `CREATE TABLE IF NOT EXISTS windows_events (...)` theo schema ở plan gốc.
  - Export `sqlite_windows_db`.

**Files KHÔNG sửa ở phase này**: server.js, app.js (để Phase 5).

**Reference**: Cách tổ chức `sqlite_wifi_db` trong cùng file [src/config/db.js](../src/config/db.js) — bê y nguyên pattern (đường dẫn, CREATE TABLE, export).

**Schema chính xác**:

```sql
CREATE TABLE IF NOT EXISTS windows_servers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  host            TEXT    NOT NULL,
  port            INTEGER DEFAULT 22,
  username        TEXT    NOT NULL,
  password        TEXT    NOT NULL,
  location        TEXT,
  status          TEXT    DEFAULT 'active',
  last_status     TEXT    DEFAULT 'unknown',
  last_cpu_pct    REAL,
  last_ram_pct    REAL,
  last_disk_json  TEXT,
  last_error      TEXT,
  last_checked_at TEXT,
  created_at      TEXT,
  updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS windows_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id   INTEGER NOT NULL,
  event_type  TEXT    NOT NULL,
  message     TEXT,
  cpu_pct     REAL,
  ram_pct     REAL,
  checked_at  TEXT    NOT NULL,
  FOREIGN KEY (server_id) REFERENCES windows_servers(id) ON DELETE CASCADE
);
```

**Verification**:
1. `node -e "require('./src/config/db.js')"` — không lỗi.
2. `sqlite3 ./database/windows_moni.db ".tables"` → thấy `windows_servers windows_events`.
3. `sqlite3 ./database/windows_moni.db ".schema windows_servers"` → đủ cột.

**Handoff cho Phase 2**:
- Tên export: `sqlite_windows_db`.
- File path để import từ models: `require('../config/db').sqlite_windows_db`.

---

## PHASE 2 — Models Layer

**Goal**: Viết 2 file model với CRUD promisified, không phụ thuộc framework.

**Prerequisites**: Phase 1 done.

**Files MỚI**:
- [src/models/windowsServer.model.js](../src/models/windowsServer.model.js)
- [src/models/windowsEvent.model.js](../src/models/windowsEvent.model.js)

**Reference**: copy structure y nguyên từ [src/models/wifiAp.model.js](../src/models/wifiAp.model.js) và [src/models/wifiEvent.model.js](../src/models/wifiEvent.model.js).

**API export của windowsServer.model.js**:
```
getAll(db)                       → Promise<Server[]>
getById(db, id)                  → Promise<Server | null>
insert(db, { name, host, port, username, password, location, status })  → Promise<{id}>
update(db, id, { name, host, port, username, password, location, status })  → Promise<{changes}>
remove(db, id)                   → Promise<{changes}>
updateStatus(db, id, { last_status, last_cpu_pct, last_ram_pct, last_disk_json, last_error, last_checked_at })  → Promise<{changes}>
```

**API export của windowsEvent.model.js**:
```
insert(db, { server_id, event_type, message, cpu_pct, ram_pct })  → Promise<{id}>
getByServerId(db, server_id, limit = 50)  → Promise<Event[]>
```

**Quy ước**:
- Mọi timestamp sinh ra trong model: `new Date().toISOString()`.
- `updated_at` luôn được set trong `update()` và `updateStatus()`.
- `created_at` chỉ set trong `insert()`.
- Tất cả hàm trả Promise (không callback).

**Verification**: viết script ad-hoc `node -e "..."`:
```js
const db = require('./src/config/db').sqlite_windows_db;
const m = require('./src/models/windowsServer.model');
(async () => {
  const { id } = await m.insert(db, { name:'t', host:'1.1.1.1', username:'u', password:'p' });
  console.log('inserted', id);
  console.log('list', await m.getAll(db));
  await m.remove(db, id);
  console.log('removed');
})();
```

**Handoff cho Phase 3**: tên function + signature để service layer gọi.

---

## PHASE 3 — Service Layer (core SSH logic)

**Goal**: Encapsulate toàn bộ logic SSH + PowerShell + polling vào 1 service module.

**Prerequisites**: Phase 2 done.

**Files MỚI**:
- [src/services/windows.service.js](../src/services/windows.service.js)

**Reference**:
- Pattern polling: copy nguyên từ [src/services/wifi.service.js](../src/services/wifi.service.js) — đặc biệt `pollAll()` (Promise.allSettled) và `startPolling(intervalMs)` (chạy ngay 1 lần + setInterval).
- PowerShell + ssh2 logic: copy `runPowerShell()` và `PS_SCRIPT` từ [scripts/test_ssh_windows.js](../scripts/test_ssh_windows.js) — đó là code ĐÃ verify chạy được trong Phase 0.

**API export**:
```
validateServerFields({ name, host, username, password, port })  // throw {status:400, message}
checkServer(server)              // SSH connect, chạy PS_SCRIPT, parse JSON, gọi updateStatus, ghi event nếu status đổi
restartServer(server)            // SSH chạy `powershell -Command "Restart-Computer -Force"`, ghi event 'restart'
shutdownServer(server)           // SSH chạy `powershell -Command "Stop-Computer -Force"`, ghi event 'shutdown'
createServer(payload)            // validate → model.insert → return server
updateServer(id, payload)        // validate → model.update
deleteServer(id)                 // model.remove
getServers()                     // model.getAll
getServer(id)                    // model.getById, throw 404 nếu null
getServerEvents(id, limit)       // model.getByServerId
pollAll()                        // filter active → checkServer cho mỗi server qua Promise.allSettled
startPolling(intervalMs = 300000)  // log + pollAll ngay + setInterval(pollAll, intervalMs)
```

**Quy ước quan trọng**:
- `checkServer` LUÔN cập nhật `last_checked_at`, kể cả khi connect fail (set `last_status='down'`, lưu lỗi vào `last_error`).
- Ghi event `up`/`down` CHỈ khi `last_status` cũ ≠ mới (so sánh trước khi gọi `updateStatus`).
- Ghi event `restart`/`shutdown` LUÔN luôn khi user trigger (action audit log).
- Sau khi `restartServer`/`shutdownServer` thành công, set `last_status='unknown'` để UI không nhầm là server bị down do lỗi mạng.
- Mọi error trong polling phải `console.error(...)` nhưng không throw — để không crash setInterval.
- SSH timeout: 10s cho check, 8s cho restart/shutdown.

**Verification**: script ad-hoc:
```js
const svc = require('./src/services/windows.service');
const db = require('./src/config/db').sqlite_windows_db;
const m = require('./src/models/windowsServer.model');
(async () => {
  const { id } = await m.insert(db, { name:'test', host:'<HOST>', username:'<U>', password:'<P>' });
  const server = await m.getById(db, id);
  console.log('check result:', await svc.checkServer(server));
  await m.remove(db, id);
})();
```

**Handoff cho Phase 4**: signature các hàm controller sẽ gọi.

---

## PHASE 4 — Controllers + Routes

**Goal**: Tạo HTTP layer expose 10 endpoint admin-only.

**Prerequisites**: Phase 3 done.

**Files MỚI**:
- [src/controllers/windows.controller.js](../src/controllers/windows.controller.js)
- [src/routes/windows.routes.js](../src/routes/windows.routes.js)

**Reference**:
- [src/controllers/wifi.controller.js](../src/controllers/wifi.controller.js) — pattern `handleError(err, res, viMsg)`, try-catch async, response shape `{ success, message?, data? }`.
- [src/routes/wifi.routes.js](../src/routes/wifi.routes.js) — `const admin = [authMiddleware, adminMiddleware]; router.METHOD(path, ...admin, controller.fn)`.

**Endpoints** (tất cả `[authMiddleware, adminMiddleware]`):

| Method | Route | Controller fn | Mô tả ngắn |
|--------|-------|---------------|------------|
| GET | `/api/windows/servers` | `getServers` | List + trạng thái hiện tại |
| POST | `/api/windows/servers` | `addServer` | Tạo |
| PUT | `/api/windows/servers/:id` | `editServer` | Sửa |
| DELETE | `/api/windows/servers/:id` | `removeServer` | Xóa |
| POST | `/api/windows/servers/:id/check` | `checkServer` | Check ngay 1 server |
| POST | `/api/windows/servers/:id/restart` | `restartServer` | Restart-Computer -Force |
| POST | `/api/windows/servers/:id/shutdown` | `shutdownServer` | Stop-Computer -Force |
| GET | `/api/windows/servers/:id/events` | `getEvents` | 50 event gần nhất |
| POST | `/api/windows/poll` | `pollAll` | Trigger poll (non-blocking, trả 200 ngay) |

**Validation tối thiểu** (controller hoặc service tùy phase trước đã đặt):
- Thiếu `name` / `host` / `username` / `password` → 400 "Thiếu thông tin bắt buộc".
- `id` không phải số → 400.
- `id` không tồn tại → 404 "Không tìm thấy server".
- SSH thất bại → 502 "Không kết nối được server qua SSH: ..."

**Verification**:
```bash
# Sau khi mount router (Phase 5):
TOKEN=$(curl -s -X POST localhost:8000/api/login -H "Content-Type: application/json" -d '{"username":"admin","password":"..."}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" localhost:8000/api/windows/servers
```

**Handoff cho Phase 5**: tên file routes để mount.

---

## PHASE 5 — App Wiring (server.js + app.js)

**Goal**: Hook router vào Express app, khởi động background polling khi server start.

**Prerequisites**: Phase 4 done. **Có thể chạy song song với Phase 6**.

**Files SỬA**:
- [src/app.js](../src/app.js):
  ```js
  const windowsRouter = require('./routes/windows.routes');
  app.use('/', windowsRouter);
  app.get('/windows', (req, res) => res.render('windows'));
  ```
- [src/server.js](../src/server.js):
  ```js
  const { startPolling: startWindowsPolling } = require('./services/windows.service');
  const WINDOWS_POLL_INTERVAL = parseInt(process.env.WINDOWS_POLL_INTERVAL) || 300000;
  // Sau connectMSSQL() và startPolling cho WiFi:
  startWindowsPolling(WINDOWS_POLL_INTERVAL);
  ```

**Reference**: cách mount `wifiRouter` và gọi `startPolling` cho WiFi trong cùng 2 file.

**Verification**:
- `node main.js` → log có dòng `Windows polling started (interval: 300000ms)`.
- Curl `http://localhost:8000/windows` (đã login) trả HTML.
- Curl `http://localhost:8000/api/windows/servers` với admin token trả `[]`.

---

## PHASE 6 — View (EJS) + CSS

**Goal**: Trang HTML quản lý Windows servers.

**Prerequisites**: Phase 4 done (cần API hoạt động để test UI). **Có thể chạy song song với Phase 5**.

**Files MỚI**:
- [src/views/windows.ejs](../src/views/windows.ejs)
- [public/css/windows.css](../public/css/windows.css)

**Reference**:
- [src/views/wifi.ejs](../src/views/wifi.ejs) — copy nguyên header (admin check ở client, username, nút back to menu), bảng table, modal form, modal events history.
- [public/css/wifi.css](../public/css/wifi.css) — copy variables (CSS vars dark theme), badge styles, modal styles.

**Layout** (xem chi tiết trong plan gốc, section "UI Layout"):
- Header: `← Menu` | `🖥️ Monitoring Windows Server` | admin username | Đăng xuất.
- Toolbar: nút `+ Thêm server`, `↻ Refresh all`, text "Auto-poll: 5 phút".
- Table cột: Tên | Host | Status badge | CPU progress bar | RAM progress bar | Disk C: | last_checked | Actions.
- Actions: nút Check, Restart, Shutdown, Edit, Delete, History.
- Modal Add/Edit: form với name, host, port, username, password, location, status.
- Modal History: list 50 event với type badge + timestamp + message.
- `confirm()` tiếng Việt trước khi Restart/Shutdown/Delete.

**Quy ước UI**:
- CPU/RAM progress bar đổi màu theo % (xanh < 60, vàng 60–85, đỏ > 85).
- Status badge `up` (xanh), `down` (đỏ), `unknown` (xám).
- Disk: hiển thị tóm tắt của ổ C: (phổ biến nhất); hover xem các ổ khác.
- Toàn UI tiếng Việt.

**Admin client-check** (đầu `<script>`):
```js
fetch('/api/me').then(r => r.json()).then(j => {
  if (!j.user || j.user.role !== 'admin') {
    alert('Bạn không có quyền truy cập');
    location.href = '/menu';
  }
});
```

**Verification**:
- Vào `http://localhost:8000/windows` thấy trang load, bảng empty.
- Mở DevTools → Network tab → fetch `/api/windows/servers` trả `[]`.
- Thêm 1 server qua form → reload → thấy trong bảng.

---

## PHASE 7 — Menu, .env.example, Feature Map, PROJECT_STRUCTURE.md

**Goal**: Cập nhật tài liệu + tích hợp vào menu chính. Đây là phase **bắt buộc**
theo yêu cầu của [CLAUDE.md](../CLAUDE.md).

**Prerequisites**: Phase 5 + 6 done.

**Files SỬA**:
- [src/views/menu.ejs](../src/views/menu.ejs) — thêm tool-card mới (icon `🖥️`, link `/windows`, title "Monitoring Windows Server"). Copy structure card hiện có.
- [.env.example](../.env.example) — thêm 2 dòng:
  ```
  WINDOWS_POLL_INTERVAL=300000
  WINDOWS_DB_PATH=./database/windows_moni.db
  ```
- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) — cập nhật toàn diện:
  - Section "Tổng quan": thêm tool mới vào danh sách nhóm tool.
  - Section "Cây thư mục đầy đủ": thêm các file mới ở routes/controllers/services/models/views/css.
  - Section "DB chính / DB phụ": thêm `windows_moni.db`.
  - Section "API Endpoints": thêm 9 dòng cho `/api/windows/*` + `/windows`.
  - Section "Databases" → "SQLite": thêm 2 bảng `windows_servers` và `windows_events` đầy đủ cột.
  - Section "Dependencies": thêm `ssh2 ^1.15.0` — "SSH client để chạy PowerShell remote trên Windows server".
  - Section "Cấu hình môi trường (.env)": thêm 2 biến mới.

**Files MỚI**:
- [feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md](../feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md)
  - Theo template `feature_map/FEATURE_MAP_TEMPLATE.md`.
  - 10 section: Tổng quan, Bản đồ file, Database, API Endpoints, Luồng dữ liệu, Validation & Error Codes, UI Layout, Module/Logic đặc biệt, Phụ thuộc & Ràng buộc, File KHÔNG bị tác động.

**Reference**: [feature_map/WIFI_MONITORING_FEATURE_MAP.md](../feature_map/WIFI_MONITORING_FEATURE_MAP.md) là ví dụ hoàn chỉnh để copy structure.

**Verification**:
- Vào `/menu` thấy tile "Monitoring Windows Server", click vào tới `/windows`.
- `grep -c "windows" PROJECT_STRUCTURE.md` ≥ 10.
- `ls feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md` exists.
- `cat .env.example | grep WINDOWS_` → 2 dòng.

---

## PHASE 8 — End-to-End Test

**Goal**: Verify toàn bộ luồng với 1 Windows server thật.

**Prerequisites**: Phase 1–7 done.

**Test cases**:

| # | Test case | Cách thực hiện | Kết quả mong đợi |
|---|-----------|----------------|-------------------|
| 1 | Server start | `node main.js` | Log: `Windows polling started (interval: 300000ms)`, không exception |
| 2 | Admin login & vào trang | Login admin → `/menu` → click tile Windows | Tới `/windows`, bảng empty |
| 3 | User thường bị chặn | Login user non-admin → vào `/windows` | Alert + redirect `/menu` |
| 4 | Thêm server | Form: tên = "TEST", host = `<từ Phase 0>`, username + password | Row mới xuất hiện, status `unknown` |
| 5 | Check manual | Click nút Check | Status → `up`, CPU/RAM/Disk có giá trị |
| 6 | Auto-poll | Tạm chỉnh `WINDOWS_POLL_INTERVAL=15000` rồi restart server | Sau 15s thấy log poll, `last_checked_at` cập nhật |
| 7 | Status change event | Tắt network Windows server → đợi 2 chu kỳ poll | Event `down` ghi vào DB, badge đổi đỏ |
| 8 | Restart command | Click Restart → confirm | Event `restart` ghi, server reboot ~30s, sau đó tự `up` lại |
| 9 | Shutdown command | Click Shutdown → confirm | Event `shutdown` ghi, server tắt |
| 10 | Cascade delete | Xóa server | Row biến mất, `windows_events` cho server đó cũng xóa hết |
| 11 | API permission | `curl /api/windows/servers` với token user thường | 403 |
| 12 | Validation | POST thiếu password | 400 với message tiếng Việt |

**Verification cuối cùng**:
- Tất cả 12 test case pass.
- Không có warning/error trong console khi app chạy bình thường.
- File `database/windows_moni.db` có 2 bảng + data.
- `PROJECT_STRUCTURE.md` và `feature_map/` đã cập nhật khớp với code.

---

## Phân công gợi ý cho nhiều AI agent

Nếu chạy song song với nhiều agent:

- **Agent A**: Phase 1 → Phase 2 (DB + Models, ít phụ thuộc).
- **Agent B**: chờ Agent A xong → Phase 3 (Service, core logic, cần model).
- **Agent C**: chờ Agent B xong → Phase 4 (Controllers + Routes).
- **Agent D + Agent E** song song: D làm Phase 5 (wiring), E làm Phase 6 (UI).
- **Agent F**: chờ D + E xong → Phase 7 (docs + menu).
- **User**: Phase 0 (setup môi trường, không AI làm hộ được vì cần access máy thật) và Phase 8 (E2E test).

Mỗi agent nên được brief:
1. Đọc plan gốc + file này.
2. Đọc file Reference của phase mình.
3. Chỉ chạm vào file trong "Files MỚI" / "Files SỬA" của phase mình.
4. Sau khi xong, chạy Verification và báo cáo trước khi handoff.
