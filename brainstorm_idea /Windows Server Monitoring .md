# Windows Server Monitoring — Implementation Plan

## Context

Hiện tại project `gasoline_prices` đã là **bộ công cụ nội bộ cho cảng MPC**, gồm 4 tool: MPC Fuel Service, ZKTeco, WiFi Monitoring, User Auth. User muốn thêm một tool mới: **Monitoring Windows Server** — cho phép admin theo dõi CPU/RAM/Disk của các Windows server vận hành, và thực hiện Restart/Shutdown từ xa khi cần.

Quyết định kỹ thuật đã chốt với user:
- **Protocol**: SSH (OpenSSH built-in trên Windows Server 2019+) + PowerShell remote commands. Dùng package `ssh2`.
- **Power control**: chỉ **Restart + Shutdown** (không làm Wake-on-LAN).
- **Polling**: background poll định kỳ giống WiFi, có lưu lịch sử events (up/down/restart/shutdown).
- **Credentials**: lưu plain text trong DB cùng record server (đồng bộ với pattern `users` hiện tại).

Tính năng này sẽ **mirror gần như 1-1 pattern của WiFi monitoring** (cùng layered architecture, cùng startPolling, cùng admin-only, cùng UI table+modal). Điều này giúp giảm rủi ro, tận dụng kinh nghiệm code đã được kiểm chứng.

---

## High-level Approach

```
View: src/views/windows.ejs  (table + form CRUD + nút Restart/Shutdown + modal lịch sử)
         ↓ admin-only check ở client + protect ở server
Routes:  src/routes/windows.routes.js  (10 endpoints, all [authMiddleware, adminMiddleware])
Ctrls:   src/controllers/windows.controller.js
Service: src/services/windows.service.js
          ├─ checkServer(server)       — SSH connect, chạy 1 PowerShell script duy nhất trả JSON {cpu, ram, disks}
          ├─ restartServer(server)     — SSH chạy `Restart-Computer -Force`
          ├─ shutdownServer(server)    — SSH chạy `Stop-Computer -Force`
          ├─ pollAll()                 — filter active, Promise.allSettled, fire-and-forget
          └─ startPolling(intervalMs)  — gọi 1 lần ở server.js
Models:  src/models/windowsServer.model.js   (CRUD bảng windows_servers, promisified)
         src/models/windowsEvent.model.js    (INSERT/SELECT bảng windows_events)
DB:      database/windows_moni.db (SQLite riêng, mirror WIFI_DB_PATH pattern)
```

---

## Database Design

**New SQLite DB**: `database/windows_moni.db` (tách riêng, KHÔNG dùng chung `fuel_data.db` hay `wifi_moni.db`).

### Table `windows_servers`

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | Tên hiển thị |
| host | TEXT NOT NULL | IP hoặc hostname |
| port | INTEGER DEFAULT 22 | Cổng SSH |
| username | TEXT NOT NULL | Tài khoản SSH (Windows admin) |
| password | TEXT NOT NULL | Plain text (đồng bộ pattern hiện tại) |
| location | TEXT | |
| status | TEXT DEFAULT 'active' | `active` / `inactive` (poll hay không) |
| last_status | TEXT DEFAULT 'unknown' | `up` / `down` / `unknown` |
| last_cpu_pct | REAL | % CPU load lần check gần nhất |
| last_ram_pct | REAL | % RAM dùng |
| last_disk_json | TEXT | JSON array `[{name:"C", used_gb, free_gb, total_gb, used_pct}]` |
| last_error | TEXT | Lỗi gần nhất nếu down (timeout, auth failed, ...) |
| last_checked_at | TEXT | ISO timestamp |
| created_at | TEXT | ISO |
| updated_at | TEXT | ISO |

### Table `windows_events`

| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| id | INTEGER PK AUTOINCREMENT | |
| server_id | INTEGER NOT NULL | FK → windows_servers.id |
| event_type | TEXT NOT NULL | `up` / `down` / `restart` / `shutdown` |
| message | TEXT | VD: "Restart triggered by user admin", error message khi down |
| cpu_pct | REAL | snapshot lúc xảy ra (NULL nếu down) |
| ram_pct | REAL | snapshot |
| checked_at | TEXT NOT NULL | ISO |

**Quy tắc ghi event**:
- `up` / `down`: chỉ insert khi status THAY ĐỔI so với lần check trước (mirror WiFi).
- `restart` / `shutdown`: insert mỗi khi user trigger từ UI (action log).

Tables tạo bằng `CREATE TABLE IF NOT EXISTS` trong [src/config/db.js](src/config/db.js) `.serialize()` block khi kết nối (mirror pattern của `wifi_aps`/`wifi_events`).

---

## PowerShell Script để collect metrics

Để tối ưu, dùng **1 PowerShell command duy nhất** trong 1 SSH session, trả JSON compact:

```powershell
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ramPct = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)
$disks = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object {
  $total = $_.Used + $_.Free
  @{ name = $_.Name; used_gb = [math]::Round($_.Used/1GB, 1); free_gb = [math]::Round($_.Free/1GB, 1); total_gb = [math]::Round($total/1GB, 1); used_pct = [math]::Round($_.Used/$total*100, 1) }
}
@{ cpu = $cpu; ram = $ramPct; disks = @($disks) } | ConvertTo-Json -Compress
```

Gọi qua SSH: `powershell -NoProfile -Command "..."` (script truyền base64 để tránh escape).

**Restart**: `powershell -Command "Restart-Computer -Force"`
**Shutdown**: `powershell -Command "Stop-Computer -Force"`

---

## API Endpoints

Tất cả `[authMiddleware, adminMiddleware]` (mirror WiFi).

| Method | Route | Mô tả |
|--------|-------|-------|
| GET | `/windows` | Render `windows.ejs` (admin check ở client, redirect /menu nếu không phải admin) |
| GET | `/api/windows/servers` | List tất cả server + trạng thái hiện tại |
| POST | `/api/windows/servers` | Thêm server mới (validate name, host, username, password) |
| PUT | `/api/windows/servers/:id` | Cập nhật cấu hình |
| DELETE | `/api/windows/servers/:id` | Xóa server (CASCADE events) |
| POST | `/api/windows/servers/:id/check` | Check ngay 1 server (SSH + collect metrics), cập nhật DB |
| POST | `/api/windows/servers/:id/restart` | Trigger `Restart-Computer -Force` qua SSH, ghi event |
| POST | `/api/windows/servers/:id/shutdown` | Trigger `Stop-Computer -Force` qua SSH, ghi event |
| GET | `/api/windows/servers/:id/events` | 50 event gần nhất |
| POST | `/api/windows/poll` | Trigger poll tất cả ngay (non-blocking) |

---

## File-level Plan

### Files MỚI tạo

| File | Mô tả ngắn |
|------|-----------|
| `src/routes/windows.routes.js` | Khai báo 10 endpoint, mỗi route gắn `[authMiddleware, adminMiddleware]` |
| `src/controllers/windows.controller.js` | 9 async handler: getServers, addServer, editServer, removeServer, checkServer, restartServer, shutdownServer, getEvents, pollAll. Dùng `handleError(err, res, viMsg)` helper giống wifi.controller.js |
| `src/services/windows.service.js` | Core: `validateServerFields`, `runPowerShell(server, script)` (helper SSH session ssh2), `checkServer(server)`, `restartServer(server)`, `shutdownServer(server)`, `pollAll()`, `startPolling(intervalMs)` |
| `src/models/windowsServer.model.js` | CRUD promisified: getAll, getById, insert, update, remove, updateStatus(id, {last_status, last_cpu_pct, last_ram_pct, last_disk_json, last_error, last_checked_at}) |
| `src/models/windowsEvent.model.js` | insert(db, {server_id, event_type, message, cpu_pct, ram_pct}), getByServerId(db, server_id, limit=50) |
| `src/views/windows.ejs` | Layout: header (username + back to /menu) + bảng server (cột: tên, host, status, CPU%, RAM%, Disk summary, last_checked, nút Check/Restart/Shutdown/Edit/Delete/History) + form thêm/sửa modal + modal lịch sử events |
| `public/css/windows.css` | Style: progress bar màu xanh→vàng→đỏ theo % CPU/RAM, badge up/down, dùng chung CSS vars với wifi.css |
| `feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md` | Theo template `feature_map/FEATURE_MAP_TEMPLATE.md` (10 section: tổng quan, bản đồ file, DB, API, flow, validation, UI layout, dependencies, ràng buộc, file KHÔNG bị tác động) |

### Files SỬA

| File | Thay đổi |
|------|----------|
| `src/config/db.js` | Thêm `sqlite_windows_db` connection (đọc `WINDOWS_DB_PATH`, default `./database/windows_moni.db`), `CREATE TABLE IF NOT EXISTS` cho `windows_servers` và `windows_events` trong `.serialize()`. Export thêm `sqlite_windows_db` |
| `src/app.js` | `app.use('/', require('./routes/windows.routes'))` + `app.get('/windows', (req,res) => res.render('windows'))` |
| `src/server.js` | Import `startPolling` từ `windows.service`, đọc `WINDOWS_POLL_INTERVAL` (default 300000), gọi `startPolling(WINDOWS_POLL_INTERVAL)` sau `connectMSSQL()` |
| `src/views/menu.ejs` | Thêm tool-card cho `/windows` với icon `🖥️`, title "Monitoring Windows Server", desc tiếng Việt |
| `.env.example` | Thêm `WINDOWS_POLL_INTERVAL=300000` và `WINDOWS_DB_PATH=./database/windows_moni.db` |
| `package.json` | Thêm dependency `"ssh2": "^1.15.0"` |
| `PROJECT_STRUCTURE.md` | Cập nhật: (1) Tổng quan thêm tool mới, (2) Cây thư mục, (3) Endpoint table, (4) Bảng `windows_servers` + `windows_events` ở section Databases, (5) DB phụ thêm `windows_moni.db`, (6) Dependencies thêm `ssh2`, (7) `.env` thêm 2 biến mới |
| `CLAUDE.md` | (Tùy chọn) thêm 1 dòng ở section "Architecture" hoặc "Databases" mention tool mới. Có thể skip nếu thấy không cần — CLAUDE.md đang khá cô đọng |

---

## Reuse Existing Patterns (KHÔNG viết lại)

- **`handleError(err, res, viMsg)`**: copy nguyên xi từ [src/controllers/wifi.controller.js](src/controllers/wifi.controller.js) (đầu file). Đây là helper trả 400/404/500 với message tiếng Việt.
- **IP/hostname validation**: tham khảo regex trong [src/services/wifi.service.js](src/services/wifi.service.js) `validateApFields`. Có thể nới rộng để chấp nhận hostname (chứ không chỉ IP).
- **Pattern `Promise.allSettled` trong `pollAll`**: copy thuật toán từ wifi.service `pollAll`.
- **`startPolling(intervalMs)`**: copy nguyên cấu trúc, đổi text log thành "Windows polling".
- **Auth middleware chain**: `const admin = [authMiddleware, adminMiddleware]; router.get(..., ...admin, handler)` — giống [src/routes/wifi.routes.js](src/routes/wifi.routes.js).
- **Promisified SQLite CRUD**: copy template từ [src/models/wifiAp.model.js](src/models/wifiAp.model.js) (getAll/getById/insert/update/remove/updateStatus với pattern `new Promise((res, rej) => db.all/run/get(...))`).
- **EJS layout + admin client-check**: copy structure từ [src/views/wifi.ejs](src/views/wifi.ejs) (DOMContentLoaded → fetch `/api/me` → check role → redirect nếu không phải admin).
- **CSS variables**: reuse từ [public/css/wifi.css](public/css/wifi.css) (dark theme, badge colors).

---

## ssh2 Usage Pattern (cốt lõi)

```js
const { Client } = require('ssh2');

function runPowerShell(server, psScript) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { conn.end(); reject(Object.assign(new Error('SSH timeout'), { code: 'TIMEOUT' })); }, 10000);
    conn.on('ready', () => {
      const b64 = Buffer.from(psScript, 'utf16le').toString('base64');
      conn.exec(`powershell -NoProfile -EncodedCommand ${b64}`, (err, stream) => {
        if (err) { clearTimeout(timer); conn.end(); return reject(err); }
        stream.on('close', (code) => { clearTimeout(timer); conn.end(); code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || `exit ${code}`)); })
              .on('data', d => stdout += d).stderr.on('data', d => stderr += d);
      });
    }).on('error', (e) => { clearTimeout(timer); reject(e); })
      .connect({ host: server.host, port: server.port || 22, username: server.username, password: server.password, readyTimeout: 8000 });
  });
}
```

Sau đó `checkServer` parse `JSON.parse(stdout)` → gọi `windowsServer.model.updateStatus(...)` → nếu `last_status` đổi thì `windowsEvent.model.insert(...)`.

---

## Validation & Error Handling

- **Required khi add/edit**: `name`, `host`, `username`, `password` → throw 400 nếu thiếu.
- **Port**: nếu có thì phải là số 1–65535, default 22.
- **SSH timeout**: 10s cho check, 5s cho restart/shutdown.
- **Restart/Shutdown response**: trả ngay sau khi SSH gửi command (không đợi server thực sự tắt). Frontend sẽ tự refresh status sau ~30s.
- **Race condition khi restart**: ngay sau khi user trigger restart, đánh dấu `last_status='unknown'` để UI không tưởng nhầm là server vừa down do lỗi network.

---

## UI Layout (windows.ejs)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  [← Menu]   🖥️ Monitoring Windows Server          [admin▾]  [Đăng xuất]    │
├────────────────────────────────────────────────────────────────────────────┤
│  [+ Thêm server]              [↻ Refresh all]    Auto-poll: 5 phút         │
├────────────────────────────────────────────────────────────────────────────┤
│ Tên     │Host          │Status│ CPU       │ RAM       │ Disk C:    │Actions │
│ APP-01  │10.10.5.21    │ ●UP  │ ▓▓▓░░ 45% │ ▓▓▓▓░ 71% │ 62%/120GB  │[⚙][▶][✕][📜]│
│ DB-01   │10.10.5.22    │ ●DOWN│ —         │ —         │ —          │[⚙][▶][✕][📜]│
└────────────────────────────────────────────────────────────────────────────┘

Modal Add/Edit:       Modal History (50 events):
  Tên: [____]           [up] 2026-05-11 10:23 — CPU 45%, RAM 71%
  Host: [____]          [restart] 2026-05-11 09:15 — Triggered by user
  Port: [22]            [down] 2026-05-10 23:01 — SSH timeout
  Username: [____]
  Password: [____]
  Location: [____]
  Status: [active ▾]
```

Nút Restart/Shutdown phải có `confirm()` dialog tiếng Việt: "Bạn có chắc muốn khởi động lại server X?".

---

## Verification

Sau khi implement xong, kiểm tra end-to-end:

1. **Setup**: chạy `npm install` để cài `ssh2`, tạo thư mục `database/` (đã có), copy `.env.example` → thêm `WINDOWS_POLL_INTERVAL` và `WINDOWS_DB_PATH`.
2. **Start**: `node main.js` → check log "Windows polling started (interval: 300000ms)" + 2 table được tạo trong `windows_moni.db` (dùng `sqlite3 database/windows_moni.db ".tables"`).
3. **Login admin** → vào `/menu` → thấy tile "Monitoring Windows Server" → click → tới `/windows`.
4. **CRUD test**:
   - Thêm 1 server (Windows Server có OpenSSH cài + user có quyền admin). Nếu không có server thật, có thể test bằng máy local Mac/Linux đã enable SSH với 1 user (dù không có PowerShell — sẽ test được flow CRUD nhưng `checkServer` sẽ trả lỗi → ghi event `down` → vẫn validate được luồng error).
   - Sửa server → reload page → giá trị mới.
   - Xóa server → row biến mất + events bị cascade delete.
5. **Check manual**: nút Check → status đổi thành `up` + CPU/RAM/Disk hiển thị.
6. **Background poll**: đợi interval (hoặc tạm set `WINDOWS_POLL_INTERVAL=15000` cho 15s để test nhanh) → log "Windows poll complete — N servers checked".
7. **Status change event**: tắt 1 server thật (hoặc unplug network) → polling next sẽ ghi event `down` + `last_status='down'`. Bật lại → ghi event `up`.
8. **Restart**: bấm nút Restart trên 1 test server → confirm dialog → SSH gửi `Restart-Computer -Force` → event `restart` ghi vào DB → server reboot.
9. **Permission test**: login với user thường (non-admin) → vào `/windows` thấy alert "Bạn không có quyền" → redirect `/menu`. Gọi trực tiếp `GET /api/windows/servers` với token user → trả 403.
10. **Feature map + PROJECT_STRUCTURE.md**: review để đảm bảo đã cập nhật đủ — yêu cầu của CLAUDE.md.

---

## Critical Files to Touch

**Tạo mới** (8 files):
- [src/routes/windows.routes.js](src/routes/windows.routes.js)
- [src/controllers/windows.controller.js](src/controllers/windows.controller.js)
- [src/services/windows.service.js](src/services/windows.service.js)
- [src/models/windowsServer.model.js](src/models/windowsServer.model.js)
- [src/models/windowsEvent.model.js](src/models/windowsEvent.model.js)
- [src/views/windows.ejs](src/views/windows.ejs)
- [public/css/windows.css](public/css/windows.css)
- [feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md](feature_map/WINDOWS_SERVER_MONITORING_FEATURE_MAP.md)

**Sửa** (7 files):
- [src/config/db.js](src/config/db.js) — thêm `sqlite_windows_db`
- [src/app.js](src/app.js) — mount router + render route
- [src/server.js](src/server.js) — startPolling
- [src/views/menu.ejs](src/views/menu.ejs) — thêm tile
- [.env.example](.env.example) — thêm 2 biến
- [package.json](package.json) — thêm ssh2
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — cập nhật toàn diện

---

## Out of Scope (KHÔNG làm trong task này)

- Wake-on-LAN (đã quyết định bỏ).
- Biểu đồ metrics theo thời gian (chỉ lưu last_*).
- Mã hóa password (giữ plain text như pattern hiện tại của bảng `users`).
- Hỗ trợ SSH key auth (chỉ password để đơn giản).
- Quản lý Windows Service (start/stop service cụ thể) — chỉ làm power control toàn server.
- Alert/notification khi down (chỉ ghi event, không email/SMS/Telegram).
