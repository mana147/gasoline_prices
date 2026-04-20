# ZKTECO_FEATURE_MAP.md

Tài liệu này mô tả toàn bộ phạm vi tác động của tính năng **Config máy chấm công ZKTeco** — dành cho AI agents hoặc developer cần hiểu nhanh feature này tác động đến những gì trong codebase.

---

## Tổng quan tính năng

| Mục | Nội dung |
|-----|---------|
| Tên tính năng | Config máy chấm công ZKTeco |
| Route UI | `GET /zkteco` |
| Phân quyền | Admin only (tất cả API đều yêu cầu `authMiddleware + adminMiddleware`) |
| Thư viện ngoài | [`zkteco-js`](https://github.com/coding-libs/zkteco-js) v1.7.0 |
| Database | SQLite — bảng `zkteco_devices` |
| Giao thức kết nối máy | TCP socket (IP + port 4370) |

---

## Bản đồ file

### File mới tạo

```
gasoline_prices/
├── src/
│   ├── routes/
│   │   └── zkteco.routes.js          ← 7 API endpoints, tất cả admin-only
│   ├── controllers/
│   │   └── zkteco.controller.js      ← 7 handlers: getDevices, addDevice, editDevice,
│   │                                    removeDevice, testConnection, setTime, syncTime
│   ├── services/
│   │   └── zkteco.service.js         ← Business logic: CRUD validate + giao tiếp ZKTeco
│   ├── models/
│   │   └── zkteco.model.js           ← SQLite CRUD bảng zkteco_devices (5 hàm promisified)
│   └── views/
│       └── zkteco.ejs                ← UI: form thêm máy + bảng danh sách + actions
│
└── public/
    └── css/
        └── zkteco.css                ← Dark theme styles cho trang ZKTeco
```

### File được sửa

| File | Thay đổi |
|------|---------|
| `src/config/db.js` | Thêm `CREATE TABLE IF NOT EXISTS zkteco_devices` trong `db.serialize()` sau khi mở SQLite |
| `src/app.js` | Import `zktecoRouter`; mount `app.use('/', zktecoRouter)`; thêm view route `GET /zkteco` |
| `src/views/menu.ejs` | Card "Coming Soon" → card active với link `href="/zkteco"` |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục, bảng API, Databases, Dependencies |
| `package.json` | Thêm dependency `zkteco-js ^1.7.0` |

---

## Database — SQLite

### Bảng `zkteco_devices`

> Được tạo tự động tại startup (`src/config/db.js`) bằng `CREATE TABLE IF NOT EXISTS`.

| Cột | Kiểu | Default | Mô tả |
|-----|------|---------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Primary key |
| `name` | TEXT | — | Tên thiết bị (bắt buộc) |
| `ip` | TEXT | — | Địa chỉ IP (bắt buộc, validate regex) |
| `port` | INTEGER | 4370 | ZKTeco default port |
| `timeout` | INTEGER | 5000 | Timeout kết nối (ms) |
| `location` | TEXT | NULL | Vị trí đặt máy (tuỳ chọn) |
| `status` | TEXT | `'active'` | `active` hoặc `inactive` |
| `created_at` | TEXT | — | ISO 8601 timestamp |
| `updated_at` | TEXT | — | ISO 8601 timestamp |

**Không có quan hệ foreign key** với bảng khác. Bảng độc lập.

---

## API Endpoints

| Method | Route | Handler | Mô tả |
|--------|-------|---------|-------|
| `GET` | `/api/zkteco/devices` | `getDevices` | Danh sách tất cả thiết bị |
| `POST` | `/api/zkteco/devices` | `addDevice` | Thêm thiết bị mới |
| `PUT` | `/api/zkteco/devices/:id` | `editDevice` | Cập nhật thiết bị |
| `DELETE` | `/api/zkteco/devices/:id` | `removeDevice` | Xóa thiết bị |
| `POST` | `/api/zkteco/devices/:id/test` | `testConnection` | Kết nối thật đến máy, trả `deviceName / serialNumber / firmware` |
| `POST` | `/api/zkteco/devices/:id/set-time` | `setTime` | Đặt giờ cho máy theo `{ datetime: "YYYY-MM-DD HH:MM:SS" }` |
| `POST` | `/api/zkteco/devices/:id/sync-time` | `syncTime` | Đồng bộ giờ máy = `new Date()` của server |

**Auth header tất cả endpoints:** `Authorization: Bearer <token>`

---

## Luồng dữ liệu (Request Flow)

### CRUD thiết bị
```
Client (zkteco.ejs JS fetch)
  → POST/PUT/DELETE /api/zkteco/devices[/:id]
  → zkteco.routes.js  [authMiddleware → adminMiddleware]
  → zkteco.controller.js  (parse body, gọi service)
  → zkteco.service.js     (validate: name+ip bắt buộc, IP regex, port range)
  → zkteco.model.js       (db.run / db.all / db.get → SQLite zkteco_devices)
  → res.json({ success, ... })
```

### Kết nối thật đến máy (test / set-time / sync-time)
```
Client
  → POST /api/zkteco/devices/:id/[test|set-time|sync-time]
  → zkteco.routes.js  [authMiddleware → adminMiddleware]
  → zkteco.controller.js
  → zkteco.service.js
      → zkteco.model.js  (getDeviceById → lấy ip, port, timeout)
      → new ZKLib(ip, port, timeout, 5200)
      → device.createSocket()          ← TCP connect đến máy vật lý
      → device.getDeviceName() / .setTime(date)  ← giao tiếp ZKTeco protocol
      → device.disconnect()            ← luôn chạy trong finally{}
  → res.json({ success, ... })
```

---

## Validation & Error Codes

| Tình huống | HTTP | Message (VI) |
|---|---|---|
| Thiếu `name` hoặc `ip` | 400 | "Tên và địa chỉ IP là bắt buộc" |
| `ip` không khớp regex | 400 | "Địa chỉ IP không hợp lệ" |
| `port` ngoài 1–65535 | 400 | "Port phải từ 1 đến 65535" |
| `timeout` < 1000ms | 400 | "Timeout tối thiểu 1000ms" |
| `datetime` sai format | 400 | "Định dạng datetime không hợp lệ (YYYY-MM-DD HH:MM:SS)" |
| Không tìm thấy device ID | 404 | "Không tìm thấy thiết bị" |
| TCP connection refused/timeout | 503 | "Không thể kết nối tới thiết bị: ..." |
| Đọc thông tin máy thất bại | 503 | "Lỗi đọc thông tin thiết bị: ..." |
| Lỗi SQLite | 500 | "Lỗi server" |

---

## UI (zkteco.ejs)

### Layout
```
┌─────────────────────────────────────────────┐
│ ← Menu   🕐 Config máy chấm công ZKTeco    │  ← page-header (sticky)
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ➕ Thêm / Cập nhật thiết bị                 │  ← card (form)
│  [Tên]  [IP]  [Port]  [Timeout]  [Vị trí]  │
│  [Thêm thiết bị]  [Hủy]                     │
│  <message area>                              │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🖥️ Danh sách thiết bị          [🔄 Làm mới]│  ← card (table)
│ ┌────┬──────────┬────────┬─────────────────┐│
│ │Tên │IP        │Port    │ Thao tác        ││
│ ├────┼──────────┼────────┼─────────────────┤│
│ │... │...       │...     │[🔌 Kiểm tra]    ││
│ │    │          │        │[🕐 Đặt giờ]     ││
│ │    │          │        │[⟳ Đồng bộ giờ] ││
│ │    │          │        │[✏️ Sửa][🗑️ Xóa]││
│ │    │          │        │                 ││
│ │    │          │        │[datetime-local] ││  ← settime-panel (ẩn/hiện)
│ │    │          │        │<result area>    ││  ← inline result
│ └────┴──────────┴────────┴─────────────────┘│
└─────────────────────────────────────────────┘
```

### Auth check (client-side)
- `DOMContentLoaded` → `fetch('/api/me')` với Bearer token
- Không có token → redirect `/login`
- `user.role !== 'admin'` → `alert` + redirect `/menu`

---

## Phụ thuộc & Ràng buộc quan trọng

| Mục | Chi tiết |
|-----|---------|
| `zkteco-js` socket | Mỗi thao tác mở socket mới → `createSocket()` + `disconnect()` trong `finally{}` |
| `inport` cố định | `5200` — cổng nhận dữ liệu từ thiết bị ZKTeco |
| Không persistent connection | Không cache kết nối; mỗi API call là 1 vòng connect/disconnect |
| `datetime-local` format | HTML input trả `YYYY-MM-DDTHH:MM`; client convert → `YYYY-MM-DD HH:MM:SS` bằng `.replace('T',' ') + ':00'` trước khi gửi API |
| Bảng độc lập | `zkteco_devices` không join với bảng `users`, `fuel_prices`, hay SQL Server |
| Admin-only | Tất cả 7 endpoint đều qua `authMiddleware + adminMiddleware`; non-admin bị chặn ở tầng route |
| `zkteco-js` chưa production-ready | Thư viện đang development stage — test kỹ trên thiết bị thật trước khi deploy |

---

## Các file KHÔNG bị tác động

Tính năng này **không sửa** các file sau:

- `src/routes/auth.routes.js`, `fuel.routes.js`, `rate.routes.js`
- `src/controllers/auth.controller.js`, `fuel.controller.js`, `rate.controller.js`
- `src/services/fuel.service.js`, `rate.service.js`
- `src/models/user.model.js`, `fuelPrice.model.js`, `rate.model.js`
- `src/middleware/auth.js`, `errorHandler.js`
- `src/handle/calculator_gasoline.js`
- `src/views/index.ejs`, `login.ejs`
- `src/server.js`
- `public/css/index.css`, `login.css`, `menu.css`
- `database/fuel_data.db` schema (bảng mới tạo tự động, không sửa schema cũ)
