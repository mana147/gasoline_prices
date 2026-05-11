# WINDOWS_SERVER_MONITORING_FEATURE_MAP.md

Tài liệu này mô tả toàn bộ phạm vi tác động của tính năng **Monitoring Windows Server** — dành cho AI agents hoặc developer cần hiểu nhanh feature này tác động đến những gì trong codebase.

---

## Tổng quan tính năng

| Mục | Nội dung |
|-----|---------|
| Tên tính năng | Monitoring Windows Server (SSH + PowerShell) |
| Route UI | `GET /windows` |
| Phân quyền | Admin only (tất cả API đều yêu cầu `authMiddleware + adminMiddleware`) |
| Thư viện ngoài | `ssh2 ^1.15.0` |
| Database | SQLite riêng — `database/windows_moni.db` (tách khỏi `fuel_data.db` và `wifi_moni.db`) |
| Giao thức check | SSH → `powershell -EncodedCommand` → parse JSON output |
| Polling | `setInterval` trong `server.js`, mặc định 300000ms (5 phút) |
| Metrics thu thập | CPU %, RAM %, Disk (tất cả ổ), Hostname, OS, Uptime |
| Hành động điều khiển | Restart-Computer -Force, Stop-Computer -Force (audit log) |

---

## Bản đồ file

### File mới tạo

```
gasoline_prices/
├── scripts/
│   └── test_ssh_windows.js             ← Script test kết nối SSH + PS (Phase 0)
│
├── brainstorm_idea/
│   ├── OPENSSH_WINDOWS_SETUP.md        ← Hướng dẫn cài OpenSSH trên Windows
│   └── WINDOWS_MONITORING_EXECUTION_PLAN.md  ← Plan phân phase
│
├── src/
│   ├── routes/
│   │   └── windows.routes.js           ← 9 routes admin-only
│   ├── controllers/
│   │   └── windows.controller.js       ← 9 handlers
│   ├── services/
│   │   └── windows.service.js          ← checkServer, restartServer, shutdownServer, pollAll, startPolling + CRUD
│   ├── models/
│   │   ├── windowsServer.model.js      ← SQLite CRUD windows_servers (6 hàm promisified)
│   │   └── windowsEvent.model.js       ← SQLite INSERT/SELECT windows_events (2 hàm)
│   └── views/
│       └── windows.ejs                 ← UI: bảng server + form CRUD + progress bars + modal lịch sử
│
├── public/css/
│   └── windows.css                     ← Dark theme, progress bar gradient, modal
│
└── feature_map/
    └── WINDOWS_SERVER_MONITORING_FEATURE_MAP.md  ← File này
```

### File được sửa

| File | Thay đổi |
|------|---------|
| `src/config/db.js` | Thêm `sqlite_windows_db` connection → `windows_moni.db`; CREATE TABLE `windows_servers` + `windows_events` |
| `src/app.js` | Import `windowsRouter`; mount `app.use('/', windowsRouter)`; thêm `GET /windows` route |
| `src/server.js` | Import `startWindowsPolling`; gọi `startWindowsPolling(WINDOWS_POLL_INTERVAL)` khi startup |
| `src/views/menu.ejs` | Thêm tool-card mới: icon 🖥️, link `/windows`, title "Monitoring Windows Server" |
| `.env.example` | Thêm `WINDOWS_POLL_INTERVAL=300000` và `WINDOWS_DB_PATH=./database/windows_moni.db` |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục, API, DB, Dependencies |

---

## Database — SQLite riêng (`windows_moni.db`)

> Bảng được tạo tự động tại startup trong connection `sqlite_windows_db` (`src/config/db.js`).  
> File tách biệt hoàn toàn — cấu hình qua env var `WINDOWS_DB_PATH`.

### Bảng `windows_servers`

| Cột | Kiểu | Default | Mô tả |
|-----|------|---------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Primary key |
| `name` | TEXT | — | Tên server (bắt buộc) |
| `host` | TEXT | — | Hostname hoặc IP (bắt buộc) |
| `port` | INTEGER | 22 | Port SSH |
| `username` | TEXT | — | Tên đăng nhập SSH (bắt buộc) |
| `password` | TEXT | — | Mật khẩu SSH (bắt buộc) |
| `location` | TEXT | NULL | Vị trí đặt server |
| `status` | TEXT | `'active'` | `active` hoặc `inactive` |
| `last_status` | TEXT | `'unknown'` | `up` \| `down` \| `unknown` |
| `last_cpu_pct` | REAL | NULL | CPU % lần check gần nhất |
| `last_ram_pct` | REAL | NULL | RAM % lần check gần nhất |
| `last_disk_json` | TEXT | NULL | JSON array tất cả ổ đĩa |
| `last_error` | TEXT | NULL | Thông báo lỗi lần check gần nhất |
| `last_checked_at` | TEXT | NULL | ISO timestamp lần check gần nhất |
| `created_at` | TEXT | — | ISO timestamp |
| `updated_at` | TEXT | — | ISO timestamp |

### Bảng `windows_events`

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | INTEGER | PK AUTOINCREMENT |
| `server_id` | INTEGER | FK → windows_servers.id ON DELETE CASCADE |
| `event_type` | TEXT | `up` \| `down` \| `restart` \| `shutdown` |
| `message` | TEXT | Chi tiết (lỗi SSH khi down, lý do khi restart/shutdown) |
| `cpu_pct` | REAL | CPU % lúc xảy ra sự kiện (NULL nếu down/restart/shutdown) |
| `ram_pct` | REAL | RAM % lúc xảy ra sự kiện |
| `checked_at` | TEXT | ISO timestamp |

---

## API Endpoints

| Method | Route | Handler | Mô tả |
|--------|-------|---------|-------|
| `GET` | `/windows` | `app.js` render | Render windows.ejs |
| `GET` | `/api/windows/servers` | `getServers` | Danh sách tất cả server + trạng thái |
| `POST` | `/api/windows/servers` | `addServer` | Thêm server mới |
| `PUT` | `/api/windows/servers/:id` | `editServer` | Cập nhật cấu hình server |
| `DELETE` | `/api/windows/servers/:id` | `removeServer` | Xóa server |
| `POST` | `/api/windows/servers/:id/check` | `checkServer` | Check ngay 1 server (SSH + PS), cập nhật DB |
| `POST` | `/api/windows/servers/:id/restart` | `restartServer` | Gửi Restart-Computer -Force |
| `POST` | `/api/windows/servers/:id/shutdown` | `shutdownServer` | Gửi Stop-Computer -Force |
| `GET` | `/api/windows/servers/:id/events` | `getEvents` | Lịch sử 50 sự kiện gần nhất |
| `POST` | `/api/windows/poll` | `pollAll` | Trigger poll tất cả server ngay (non-blocking) |

**Auth header tất cả API:** `Authorization: Bearer <token>` — Admin only

**Error codes:**
- `400` — Thiếu trường bắt buộc hoặc dữ liệu không hợp lệ
- `403` — Không phải admin
- `404` — Không tìm thấy server
- `502` — Không kết nối được server qua SSH

---

## Luồng dữ liệu (Request Flow)

### CRUD Server
```
Client (windows.ejs JS fetch)
  → POST/PUT/DELETE /api/windows/servers[/:id]
  → windows.routes.js  [authMiddleware → adminMiddleware]
  → windows.controller.js  (parse body)
  → windows.service.js     (validateServerFields: name+host+username+password bắt buộc)
  → windowsServer.model.js (db.run/db.get → SQLite windows_servers)
  → res.json({ success, server })
```

### Check 1 server (manual hoặc từ polling)
```
POST /api/windows/servers/:id/check  hoặc  startPolling → pollAll → checkServer(server)
  → windows.service.checkServer(server)
      1. SSH connect (timeout 10s):
           ssh2.Client().connect({ host, port, username, password, readyTimeout:10000 })
      2. Chạy PowerShell:
           powershell -NoProfile -NonInteractive -EncodedCommand <base64 UTF-16LE>
           PS_SCRIPT: Get-CimInstance Win32_Processor (cpu%), Win32_OperatingSystem (ram%, uptime),
                      Get-PSDrive -PSProvider FileSystem (tất cả ổ đĩa)
           → JSON: { cpu, ram, disks:[{name,used_gb,free_gb,total_gb,used_pct}], hostname, os, uptime_sec }
      3. windowsServer.model.updateStatus(db, id, { last_status, cpu, ram, disk_json, error, checked_at })
      4. Nếu last_status thay đổi:
           windowsEvent.model.insert(db, { server_id, event_type:new_status, message:error_if_down, cpu, ram })
           console.log "Windows SERVER — old → new"
  → res.json({ status, cpu, ram, disk_json }) hoặc 502 nếu down
```

### Restart / Shutdown
```
POST /api/windows/servers/:id/restart (hoặc /shutdown)
  → windows.service.restartServerNow(id) / shutdownServerNow(id)
      1. SSH → powershell -EncodedCommand "Restart-Computer -Force" (timeout 8s)
         (lỗi "stream closed" / "EOF" bỏ qua vì server tắt kết nối ngay)
      2. updateStatus → last_status = 'unknown' (UI không nhầm với down lỗi mạng)
      3. Event insert: event_type = 'restart' | 'shutdown' (LUÔN ghi, kể cả khi SSH bị ngắt)
  → res.json({ success, message })
```

### Background polling
```
server.js startup:
  → startWindowsPolling(WINDOWS_POLL_INTERVAL=300000ms)
      → pollAll() ngay lập tức (lần đầu)
      → setInterval(pollAll, 300000)

pollAll():
  → windowsServer.model.getAll(db) filter status='active'
  → Promise.allSettled(servers.map(checkServer))   ← song song
  → log "Windows poll complete — X servers checked"
```

---

## Validation & Error Codes

| Trường hợp | HTTP Code | Message |
|------------|-----------|---------|
| Thiếu name/host/username/password | 400 | "Thiếu thông tin bắt buộc: name, host, username, password" |
| Host chứa ký tự không hợp lệ | 400 | "Host không hợp lệ" |
| Port ngoài 1–65535 | 400 | "Port không hợp lệ (1–65535)" |
| id không tồn tại trong DB | 404 | "Không tìm thấy server" |
| SSH connect thất bại | 502 | "Không kết nối được server qua SSH: \<lỗi\>" |
| Token thiếu/sai | 401 | (từ authMiddleware) |
| Không phải admin | 403 | (từ adminMiddleware) |

---

## UI Layout (windows.ejs)

```
┌───────────────────────────────────────────────────────────────────┐
│ ← Menu   🖥️ Monitoring Windows Server              Admin (Admin)  │  sticky header
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ 🖥️ Thêm server mới  [+ Thêm server]                               │  form card
│   [Tên*] [Host*] [Port] [Username*] [Password*] [Vị trí]          │  (ẩn/hiện)
│   [Thêm server]  [Hủy]   <message>                                │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│ 🖥️ Danh sách server   Auto-poll: 5 phút  [⚡Poll] [🔄]           │  table card
│ Tên      | Host          | Status  | CPU ████░ 27% | RAM ████ 49% │
│ MPC-IIS  | 172.16.10.4   | 🟢 Online|              |              │
│          |               |         | Disk C: ██░ 29% | Lúc...     │
│          Thao tác: [🔍 Check] [📋 Lịch sử] [✏️ Sửa] [🔄 Restart] [⏻ Shutdown] [🗑️] │
└───────────────────────────────────────────────────────────────────┘

[Modal: Lịch sử — MPC-IIS]
  Thời gian           | Sự kiện         | CPU  | RAM  | Chi tiết
  2026-05-11 10:00:00 | 🟢 Online       | 27%  | 49%  |
  2026-05-11 09:55:00 | 🔴 Offline      |  —   |  —   | SSH timeout
```

### Tính năng UI
- **Auto-refresh** `setInterval(loadServers, 30000)` — cập nhật bảng mỗi 30 giây
- **Progress bar** CPU/RAM: xanh (<60%), vàng (60–85%), đỏ (>85%)
- **Disk tooltip** — hover hiện tất cả ổ đĩa, hiển thị nhanh ổ C:
- **Pulse animation** — dot xanh nhấp nháy khi server online
- **confirm()** tiếng Việt trước Restart, Shutdown, Delete
- **Auth check** DOMContentLoaded → `/api/me` → redirect nếu không phải admin
- **Modal lịch sử** — 4 loại event: Online/Offline/Restart/Shutdown với màu riêng

---

## Module/Logic đặc biệt

### PS_SCRIPT (trong windows.service.js)
Script PowerShell duy nhất được encode base64 UTF-16LE và chạy qua `-EncodedCommand` để tránh escape phức tạp. Script thu thập toàn bộ metrics trong 1 lần SSH exec.

### Xử lý Restart/Shutdown
`Restart-Computer -Force` và `Stop-Computer -Force` đóng kết nối SSH ngay lập tức. Service bắt lỗi `stream closed`/`EOF` và bỏ qua (đây là hành vi bình thường). Sau đó set `last_status='unknown'` thay vì `'down'` để UI phân biệt được "server đang khởi động lại" với "server mất kết nối mạng".

### CASCADE DELETE
`windows_events` có `FOREIGN KEY (server_id) REFERENCES windows_servers(id) ON DELETE CASCADE` — xóa server tự động xóa hết events.

---

## Phụ thuộc & Ràng buộc quan trọng

| Mục | Chi tiết |
|-----|---------|
| `ssh2` | Cài bằng `npm install ssh2`; version hiện dùng: xem `package.json` |
| Windows target | OpenSSH Server phải cài và chạy (port 22 mặc định) |
| Auth method | Password authentication (PasswordAuthentication yes trong sshd_config) |
| Tài khoản | Phải thuộc group **Administrators** để chạy `Get-CimInstance` và `Restart-Computer` |
| Event log | Ghi khi status thay đổi (up/down); LUÔN ghi khi restart/shutdown |
| Polling non-blocking | `POST /api/windows/poll` trả về ngay, poll chạy ngầm |
| SSH timeout | 10s cho check, 8s cho restart/shutdown |

---

## Các file KHÔNG bị tác động

Tính năng này **không sửa** các file sau:

- `src/routes/auth.routes.js`, `fuel.routes.js`, `rate.routes.js`, `zkteco.routes.js`, `wifi.routes.js`
- `src/controllers/auth.controller.js`, `fuel.controller.js`, `rate.controller.js`, `zkteco.controller.js`, `wifi.controller.js`
- `src/services/fuel.service.js`, `rate.service.js`, `zkteco.service.js`, `wifi.service.js`
- `src/models/user.model.js`, `fuelPrice.model.js`, `rate.model.js`, `zkteco.model.js`, `zkEmployee.model.js`, `wifiAp.model.js`, `wifiEvent.model.js`
- `src/middleware/auth.js`, `errorHandler.js`
- `src/handle/calculator_gasoline.js`
- `src/views/index.ejs`, `login.ejs`, `zkteco.ejs`, `zkteco_device.ejs`, `wifi.ejs`
- `public/css/index.css`, `login.css`, `menu.css`, `zkteco.css`, `zkteco_device.css`, `wifi.css`
