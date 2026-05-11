# PROJECT_STRUCTURE.md

Tài liệu này mô tả toàn bộ cấu trúc dự án **gasoline_prices** — dành cho AI agents và developers mới cần hiểu nhanh codebase.

---

## Tổng quan

Ứng dụng Node.js/Express là **bộ công cụ nội bộ tổng hợp dành cho cảng MPC**. Ban đầu dự án chỉ phục vụ tính phụ thu nhiên liệu (vẫn giữ tên repo `gasoline_prices`), nhưng hiện đã mở rộng thành nền tảng tập hợp nhiều tool service vận hành cho cảng. Người dùng đăng nhập một lần, vào trang menu để chọn tool cần dùng.

Các nhóm tool hiện có:
- **MPC Fuel Service** — lấy giá dầu DO từ API bên ngoài, tính phụ thu nhiên liệu cho 6 loại container, lưu SQLite và đồng bộ biểu cước với SQL Server (`TRF_STD`).
- **ZKTeco Device Manager** — quản lý thiết bị chấm công ZKTeco (CRUD thiết bị, kiểm tra kết nối, đặt/đồng bộ giờ, đồng bộ và quản lý nhân viên trên máy).
- **WiFi AP Monitoring** — giám sát các Access Point WiFi của cảng qua ICMP ping + SNMP (uptime, số client), lưu lịch sử sự kiện up/down, hỗ trợ poll định kỳ ở background.
- **Windows Server Monitoring** — giám sát Windows Server qua SSH + PowerShell (CPU, RAM, Disk, Uptime), hỗ trợ restart/shutdown remote, lưu lịch sử sự kiện, poll định kỳ ở background.
- **User & Auth Management** — đăng nhập token-based, phân quyền `user` / `admin`, CRUD tài khoản (dùng chung cho mọi tool).

Kiến trúc kỹ thuật:
- **Backend**: Express.js REST API (port 8000), tổ chức theo layers routes → controllers → services → models
- **Frontend**: EJS templates (`src/views/`), giao diện tiếng Việt, mỗi tool 1 trang riêng
- **Static assets**: CSS + logo trong `public/`
- **DB chính**: SQLite — `database/fuel_data.db` (users, fuel_prices, zkteco_devices, zkteco_employees)
- **DB phụ 1**: SQLite riêng — `database/wifi_moni.db` (wifi_aps, wifi_events) cho WiFi monitoring
- **DB phụ 2**: SQLite riêng — `database/windows_moni.db` (windows_servers, windows_events) cho Windows monitoring
- **DB ngoài**: SQL Server (optional, cho bảng biểu cước TRF_STD của tool fuel)

---

## Cây thư mục đầy đủ

```
gasoline_prices/
├── main.js                          # Entry point: require('./src/server')
├── .env                             # Biến môi trường (không commit)
├── .env.example                     # Template cấu hình
├── package.json                     # Dependencies
├── CLAUDE.md                        # Hướng dẫn cho Claude Code
├── PROJECT_STRUCTURE.md             # File này
│
├── src/                             # Toàn bộ source code backend
│   ├── server.js                    # Khởi động server: dotenv, connectMSSQL, listen
│   ├── app.js                       # Express factory: EJS setup, middleware, mount routes
│   │
│   ├── config/
│   │   └── db.js                    # Singleton connections: SQLite + MSSQL
│   │
│   ├── routes/
│   │   ├── auth.routes.js           # Routes: /login, /api/login, /api/users, ...
│   │   ├── fuel.routes.js           # Routes: /api/get_fuel_price, /api/get_surcharge_table
│   │   ├── rate.routes.js           # Routes: /api/get_trf_std, /api/update_trf_std
│   │   ├── zkteco.routes.js         # Routes: /api/zkteco/devices (CRUD) + /test + /set-time + /sync-time
│   │   ├── wifi.routes.js           # Routes: /api/wifi/aps (CRUD) + /check + /events + /poll
│   │   └── windows.routes.js        # Routes: /api/windows/servers (CRUD) + /check + /restart + /shutdown + /events + /poll
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Handlers: login, logout, register, user CRUD; render login.ejs
│   │   ├── fuel.controller.js       # Handlers: getFuelPrice, getSurchargeTable
│   │   ├── rate.controller.js       # Handlers: getTrfStd, updateTrfStd
│   │   ├── zkteco.controller.js     # Handlers: getDevices, addDevice, editDevice, removeDevice, testConnection, setTime, syncTime
│   │   ├── wifi.controller.js       # Handlers: getAps, addAp, editAp, removeAp, checkAp, getEvents, pollAll
│   │   └── windows.controller.js    # Handlers: getServers, addServer, editServer, removeServer, checkServer, restartServer, shutdownServer, getEvents, pollAll
│   │
│   ├── services/
│   │   ├── fuel.service.js          # Logic: gọi API ngoài + tính 6 loại container
│   │   ├── rate.service.js          # Logic: đọc/cập nhật TRF_STD, validate trf_code
│   │   ├── zkteco.service.js        # Logic: CRUD validate, ZKTeco socket connection, đặt/đồng bộ giờ
│   │   ├── wifi.service.js          # Logic: ping + SNMP check, pollAll, startPolling (background)
│   │   └── windows.service.js       # Logic: SSH+PS check, restart, shutdown, pollAll, startPolling (background)
│   │
│   ├── models/
│   │   ├── user.model.js            # SQLite: CRUD bảng users (8 hàm promisified)
│   │   ├── fuelPrice.model.js       # SQLite: INSERT/SELECT bảng fuel_prices
│   │   ├── rate.model.js            # SQL Server: SELECT/UPDATE bảng TRF_STD
│   │   ├── zkteco.model.js          # SQLite: CRUD bảng zkteco_devices (5 hàm promisified)
│   │   ├── zkEmployee.model.js      # SQLite: CRUD bảng zkteco_employees (5 hàm promisified)
│   │   ├── wifiAp.model.js          # SQLite: CRUD bảng wifi_aps (6 hàm promisified)
│   │   ├── wifiEvent.model.js       # SQLite: INSERT/SELECT bảng wifi_events (2 hàm)
│   │   ├── windowsServer.model.js   # SQLite: CRUD bảng windows_servers (6 hàm promisified)
│   │   └── windowsEvent.model.js    # SQLite: INSERT/SELECT bảng windows_events (2 hàm)
│   │
│   ├── middleware/
│   │   ├── auth.js                  # Token store (Map), generateToken, authMiddleware, adminMiddleware
│   │   └── errorHandler.js          # Express error handler tập trung
│   │
│   ├── handle/
│   │   └── calculator_gasoline.js   # Bảng phụ thu + hàm tính toán
│   │
│   └── views/                       # EJS templates (thay thế view/ tĩnh cũ)
│       ├── index.ejs                # Tool MPC Fuel Service (date picker → fetch → hiển thị phụ thu)
│       ├── menu.ejs                 # Trang menu trung gian sau đăng nhập (chọn tool)
│       ├── login.ejs                # Trang đăng nhập
│       ├── zkteco.ejs               # Danh sách thiết bị ZKTeco (CRUD thiết bị)
│       ├── zkteco_device.ejs        # Chi tiết thiết bị: kết nối, thời gian, quản lý nhân viên
│       ├── wifi.ejs                 # Monitoring WiFi AP: bảng status, form CRUD, modal lịch sử
│       └── windows.ejs              # Monitoring Windows Server: bảng CPU/RAM/Disk, form CRUD, modal lịch sử
│
├── public/
│   ├── css/
│   │   ├── index.css
│   │   ├── login.css
│   │   ├── menu.css                 # Styles cho trang menu tool
│   │   ├── zkteco.css               # Styles cho trang danh sách thiết bị ZKTeco
│   │   ├── zkteco_device.css        # Styles cho trang chi tiết thiết bị ZKTeco
│   │   ├── wifi.css                 # Styles cho trang Monitoring WiFi AP
│   │   └── windows.css              # Styles cho trang Monitoring Windows Server
│   └── logo.png
│
├── scripts/
│   ├── test_zkteco_users.js         # Script test lấy danh sách user từ máy ZKTeco
│   ├── test_snmp_wifi.js            # Script test ping + SNMP GET cơ bản cho WiFi AP
│   ├── test_snmp_walk.js            # Script walk MIB sâu để khám phá OID
│   └── test_snmp_clients.js         # Script xác minh OID client count trên Altai AP
│
├── brainstorm_idea/
│   ├── info_WiFi.md                 # Kết quả nmap scan AP, phân tích subnet
│   ├── WIFI_MONITORING_PLAN.md      # Plan phân phase 0–7 cho tính năng WiFi monitoring
│   └── test_wifi.md                 # Runbook khám phá SNMP OID cho model WiFi AP mới
│
├── scripts/
│   ├── migrate_wifi_db.js           # Script migrate 1 lần: wifi_aps + wifi_events fuel_data.db → wifi_moni.db
│   ├── test_ssh_windows.js          # Script test kết nối SSH + PowerShell tới Windows Server
│   └── ...
│
└── database/
    ├── fuel_data.db                 # SQLite chính: users, fuel_prices, zkteco_devices, zkteco_employees
    ├── wifi_moni.db                 # SQLite riêng cho WiFi monitoring: wifi_aps, wifi_events
    └── windows_moni.db              # SQLite riêng cho Windows monitoring: windows_servers, windows_events
```

---

## Luồng dữ liệu (Request Flow)

### 1. Lấy giá nhiên liệu & tính phụ thu

```
GET /api/get_fuel_price?date=YYYY-MM-DD
  → fuel.routes.js (authMiddleware)
  → fuel.controller.getFuelPrice()
      → fuel.service.fetchAndCalculateFuelPrice(date)
          → getFuelByDate(date)          # axios → giaxanghomnay.com/api/pvdate/{date}
          → getFuelByTitle(data, ...)    # lọc lấy "DO 0,05S-II" của Petrolimex
          → tinhGiaCuocTheoDauDO(gia, containerType, 0)  # x6 loại container
      → fuelPrice.model.insertFuelPrice(db, record)   # lưu vào SQLite
  → res.json({ date, zone1_price, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 })
```

### 2. Đăng nhập

```
POST /api/login  { username, password }
  → auth.routes.js
  → auth.controller.login()
      → user.model.findUserByCredentials(db, username, password)   # SQLite SELECT
      → generateToken()                 # crypto.randomBytes(32)
      → activeTokens.set(token, {...})  # lưu vào Map in-memory
      → user.model.updateLastLogin(db, userId)
  → res.json({ token, user })
```

### 3. Cập nhật biểu cước TRF_STD

```
POST /api/update_trf_std  { trf_code: "NH", hang_20, hang_40, hang_45 }
  → rate.routes.js (authMiddleware + adminMiddleware)
  → rate.controller.updateTrfStd()
      → rate.service.updateRate(trf_code, values)
          → validate trf_code ∈ ['NH','HH','NR','HR']
          → validate required fields (hang_* cho NH/HH, rong_* cho NR/HR)
          → ms_sql.connect(mssqlConfig)
          → rate.model.updateTrfStd(pool, trf_code, params)   # SQL Server UPDATE
  → res.json({ success, rowsAffected })
```

---

## API Endpoints

| Method | Route | Auth | Role | Mô tả |
|--------|-------|------|------|-------|
| GET | `/` | — | — | Render index.ejs (tool MPC Fuel Service) |
| GET | `/menu` | — | — | Render menu.ejs (trang chọn tool) |
| GET | `/login` | — | — | Render login.ejs |
| POST | `/api/login` | — | — | Đăng nhập, trả token |
| POST | `/api/logout` | ✓ | user | Hủy token |
| GET | `/api/me` | ✓ | user | Thông tin user hiện tại |
| POST | `/api/register` | — | — | Tạo tài khoản mới |
| GET | `/api/users` | ✓ | admin | Danh sách users |
| GET | `/api/users/:id` | ✓ | user | User theo ID |
| PUT | `/api/users/:id` | ✓ | user | Cập nhật user |
| DELETE | `/api/users/:id` | ✓ | admin | Xóa user |
| GET | `/api/get_fuel_price` | ✓ | user | Lấy giá dầu + tính phụ thu |
| GET | `/api/get_surcharge_table` | — | — | Bảng phụ thu (10 mức giá) |
| GET | `/api/get_trf_std` | ✓ | user | Biểu cước hiện tại từ SQL Server |
| POST | `/api/update_trf_std` | ✓ | admin | Cập nhật biểu cước SQL Server |
| GET | `/wifi` | — | — | Render wifi.ejs (monitoring WiFi AP, admin check ở client) |
| GET | `/api/wifi/aps` | ✓ | admin | Danh sách AP + trạng thái hiện tại |
| POST | `/api/wifi/aps` | ✓ | admin | Thêm AP mới |
| PUT | `/api/wifi/aps/:id` | ✓ | admin | Cập nhật cấu hình AP |
| DELETE | `/api/wifi/aps/:id` | ✓ | admin | Xóa AP |
| POST | `/api/wifi/aps/:id/check` | ✓ | admin | Check ngay 1 AP (ping + SNMP), cập nhật DB |
| GET | `/api/wifi/aps/:id/events` | ✓ | admin | Lịch sử 50 sự kiện gần nhất |
| POST | `/api/wifi/poll` | ✓ | admin | Trigger poll tất cả AP ngay (non-blocking) |
| GET | `/windows` | — | — | Render windows.ejs (monitoring Windows Server, admin check ở client) |
| GET | `/api/windows/servers` | ✓ | admin | Danh sách server + trạng thái hiện tại |
| POST | `/api/windows/servers` | ✓ | admin | Thêm server mới |
| PUT | `/api/windows/servers/:id` | ✓ | admin | Cập nhật cấu hình server |
| DELETE | `/api/windows/servers/:id` | ✓ | admin | Xóa server |
| POST | `/api/windows/servers/:id/check` | ✓ | admin | Check ngay 1 server (SSH + PS), cập nhật DB |
| POST | `/api/windows/servers/:id/restart` | ✓ | admin | Restart-Computer -Force |
| POST | `/api/windows/servers/:id/shutdown` | ✓ | admin | Stop-Computer -Force |
| GET | `/api/windows/servers/:id/events` | ✓ | admin | Lịch sử 50 sự kiện gần nhất |
| POST | `/api/windows/poll` | ✓ | admin | Trigger poll tất cả server ngay (non-blocking) |
| GET | `/zkteco` | — | — | Render zkteco.ejs (danh sách thiết bị, admin check ở client) |
| GET | `/zkteco/devices/:id` | — | — | Render zkteco_device.ejs (chi tiết thiết bị, admin check ở client) |
| GET | `/api/zkteco/devices` | ✓ | admin | Danh sách thiết bị ZKTeco |
| POST | `/api/zkteco/devices` | ✓ | admin | Thêm thiết bị ZKTeco |
| PUT | `/api/zkteco/devices/:id` | ✓ | admin | Cập nhật thiết bị |
| DELETE | `/api/zkteco/devices/:id` | ✓ | admin | Xóa thiết bị |
| POST | `/api/zkteco/devices/:id/test` | ✓ | admin | Kiểm tra kết nối, lấy thông tin máy |
| POST | `/api/zkteco/devices/:id/set-time` | ✓ | admin | Đặt giờ cho thiết bị (YYYY-MM-DD HH:MM:SS) |
| POST | `/api/zkteco/devices/:id/sync-time` | ✓ | admin | Đồng bộ giờ thiết bị với server |
| GET | `/api/zkteco/devices/:id/employees` | ✓ | admin | Danh sách nhân viên từ SQLite |
| POST | `/api/zkteco/devices/:id/employees/sync` | ✓ | admin | Đồng bộ nhân viên từ máy → SQLite |
| POST | `/api/zkteco/devices/:id/employees` | ✓ | admin | Thêm nhân viên lên máy + lưu SQLite |
| PUT | `/api/zkteco/devices/:id/employees/:uid` | ✓ | admin | Sửa thông tin nhân viên trên máy + SQLite |
| DELETE | `/api/zkteco/devices/:id/employees/:uid` | ✓ | admin | Xóa nhân viên khỏi máy + SQLite |

---

## Databases

### SQLite — `database/fuel_data.db`

**Bảng `fuel_prices`**
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| date | TEXT | Ngày lấy giá (YYYY-MM-DD) |
| brand | TEXT | Thương hiệu ("petrolimex") |
| title | TEXT | Loại nhiên liệu ("DO 0,05S-II") |
| zone1_price | REAL | Giá vùng 1 |
| zone2_price | REAL | Giá vùng 2 |
| hang_20/40/45 | REAL | Phụ thu container hàng 20/40/45 ft |
| rong_20/40/45 | REAL | Phụ thu container rỗng 20/40/45 ft |
| status | TEXT | Trạng thái ("active") |
| createdAt | TEXT | ISO timestamp |

**Bảng `users`**
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| username | TEXT | Tên đăng nhập (unique) |
| password | TEXT | Mật khẩu (plain text — chưa hash) |
| email | TEXT | Email |
| full_name | TEXT | Họ tên |
| role | TEXT | `user` hoặc `admin` |
| status | TEXT | `active` hoặc `inactive` |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |
| last_login | TEXT | ISO timestamp |

**Bảng `wifi_aps`** — cấu hình + trạng thái hiện tại của từng AP
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| name | TEXT | Tên AP (bắt buộc) |
| ip | TEXT | Địa chỉ IP (bắt buộc) |
| location | TEXT | Vị trí đặt AP |
| snmp_community | TEXT | SNMP community string (default: `public`) |
| snmp_client_oid | TEXT | OID walk đếm client — Altai: `1.3.6.1.4.1.27586.7.4.2.2.1.6` |
| status | TEXT | `active` hoặc `inactive` |
| last_status | TEXT | `up` \| `down` \| `unknown` |
| last_ping_ms | INTEGER | Ping round-trip ms lần check gần nhất |
| last_clients | INTEGER | Số client đang kết nối |
| last_uptime_sec | INTEGER | Uptime tính bằng giây |
| last_checked_at | TEXT | ISO timestamp lần check gần nhất |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Bảng `wifi_events`** — lịch sử sự kiện up/down
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| ap_id | INTEGER | FK → wifi_aps.id |
| event_type | TEXT | `up` hoặc `down` |
| ping_ms | INTEGER | Ping ms lúc xảy ra (NULL nếu down) |
| checked_at | TEXT | ISO timestamp |

**Bảng `zkteco_devices`**
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| name | TEXT | Tên thiết bị |
| ip | TEXT | Địa chỉ IP |
| port | INTEGER | Port (default 4370) |
| timeout | INTEGER | Timeout ms (default 5000) |
| location | TEXT | Vị trí đặt máy |
| status | TEXT | `active` hoặc `inactive` |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Bảng `zkteco_employees`** — nhân viên cache từ máy ZKTeco
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| device_id | INTEGER | FK → zkteco_devices.id |
| uid | INTEGER | Slot ID trên máy (1–3000) |
| user_id | TEXT | Mã nhân viên (max 9 ký tự) |
| name | TEXT | Họ tên (max 24 ký tự) |
| role | INTEGER | 0=user, 14=admin |
| password | TEXT | Mật khẩu (max 8 ký tự) |
| cardno | INTEGER | Số thẻ RF |
| synced_at | TEXT | ISO timestamp lần sync gần nhất |
- UNIQUE(device_id, uid) — mỗi uid chỉ có 1 bản trên 1 máy

### SQLite — `database/windows_moni.db`

**Bảng `windows_servers`**
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| name | TEXT | Tên server |
| host | TEXT | Hostname hoặc IP |
| port | INTEGER | Port SSH (default 22) |
| username | TEXT | Tên đăng nhập SSH |
| password | TEXT | Mật khẩu SSH |
| location | TEXT | Vị trí đặt server |
| status | TEXT | `active` hoặc `inactive` |
| last_status | TEXT | `up` \| `down` \| `unknown` |
| last_cpu_pct | REAL | CPU % lần check gần nhất |
| last_ram_pct | REAL | RAM % lần check gần nhất |
| last_disk_json | TEXT | JSON array ổ đĩa [{name,used_gb,free_gb,total_gb,used_pct}] |
| last_error | TEXT | Thông báo lỗi lần check gần nhất |
| last_checked_at | TEXT | ISO timestamp lần check gần nhất |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**Bảng `windows_events`**
| Cột | Kiểu | Mô tả |
|-----|------|-------|
| id | INTEGER | Primary key |
| server_id | INTEGER | FK → windows_servers.id ON DELETE CASCADE |
| event_type | TEXT | `up` \| `down` \| `restart` \| `shutdown` |
| message | TEXT | Chi tiết sự kiện (lỗi SSH nếu down) |
| cpu_pct | REAL | CPU % lúc xảy ra |
| ram_pct | REAL | RAM % lúc xảy ra |
| checked_at | TEXT | ISO timestamp |

---

### SQL Server — `PRD_MPC`

**Bảng `TRF_STD`** — biểu cước phụ thu theo loại hàng
- 4 bản ghi cố định theo `rowguid`: NH (nội hàng), HH (hoàn hàng), NR (nội rỗng), HR (hoàn rỗng)
- Cột: `TRF_CODE`, `AMT_F20`, `AMT_F40`, `AMT_F45` (hàng), `AMT_E20`, `AMT_E40`, `AMT_E45` (rỗng)

---

## Module chính: src/handle/calculator_gasoline.js

```
bangPhuThu[]          — mảng 10 phần tử, mỗi phần tử là 1 mức giá dầu:
                        { giaFrom, giaTo, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 }
                        Mức giá: 0–23k, 23–26k, 26–29k, ..., 47–50k, >50k

tinhGiaCuocTheoDauDO(giaDauDO, loaiContainer, default)
                      — nhận giá DO (VND), loại container, trả { phuThu: number }
```

---

## Authentication

- **Cơ chế**: Token ngẫu nhiên 32 bytes (hex), lưu trong `Map` in-memory (`activeTokens`)
- **Thời hạn**: 24 giờ kể từ lúc login
- **Lưu ý**: Token mất sau khi restart server (thiết kế cho internal use)
- **Phân quyền**: `authMiddleware` xác thực token, `adminMiddleware` kiểm tra `role === 'admin'`
- **Import chung**: cả `auth.controller` lẫn middleware đều dùng cùng `activeTokens` từ `src/middleware/auth.js`

---

## Cấu hình môi trường (.env)

```env
PORT=8000
API_BASE_URL=https://giaxanghomnay.com/api/pvdate/
API_TIMEOUT=10000
SQLITE_DB_PATH=./database/fuel_data.db
MSSQL_USER=
MSSQL_PASSWORD=
MSSQL_SERVER=
MSSQL_DATABASE=
MSSQL_ENCRYPT=false
WIFI_POLL_INTERVAL=300000
WIFI_DB_PATH=./database/wifi_moni.db
WINDOWS_POLL_INTERVAL=300000
WINDOWS_DB_PATH=./database/windows_moni.db
MSSQL_TRUST_SERVER_CERTIFICATE=true
```

---

## Dependencies

| Package | Version | Dùng cho |
|---------|---------|---------|
| express | ^4.21.2 | Web framework |
| axios | ^1.13.6 | Gọi API giá nhiên liệu ngoài |
| sqlite3 | ^6.0.1 | Database chính (users, fuel_prices) |
| mssql | ^11.0.1 | SQL Server (TRF_STD biểu cước) |
| dotenv | ^17.3.1 | Load biến môi trường |
| cors | ^2.8.5 | Cross-origin |
| body-parser | ^1.20.3 | Parse JSON body |
| zkteco-js | ^1.7.0 | Giao tiếp thiết bị chấm công ZKTeco qua TCP/UDP |
| ping | ^0.4.4 | ICMP ping check cho WiFi AP monitoring |
| net-snmp | ^3.11.3 | SNMP v2c GET/Walk để lấy uptime + client count từ AP |
| ssh2 | ^1.15.0 | SSH client để chạy PowerShell remote trên Windows server |

---

## Ràng buộc quan trọng

1. **Không có migration script** — bảng SQLite phải tồn tại trước khi chạy app
2. **Bảng phụ thu hardcode** trong `src/handle/calculator_gasoline.js` — muốn thay đổi mức giá phải sửa trực tiếp file đó
3. **Mật khẩu plain text** trong SQLite — chưa có bcrypt/hash
4. **SQL Server là optional** — kết nối thất bại chỉ log warning, không crash app
5. **Token in-memory** — không persistent qua restart, không hỗ trợ multi-instance
6. **Toàn bộ UI/messages bằng tiếng Việt**
7. **Không có test suite** — verify bằng curl/Postman thủ công
