# PROJECT_STRUCTURE.md

Tài liệu này mô tả toàn bộ cấu trúc dự án **gasoline_prices** — dành cho AI agents và developers mới cần hiểu nhanh codebase.

---

## Tổng quan

Ứng dụng Node.js/Express quản lý và tính toán **phụ thu nhiên liệu** (fuel surcharge) cho container vận chuyển. Lấy giá dầu DO từ API bên ngoài, tính phụ thu theo bảng cước, lưu vào SQLite, và đồng bộ biểu cước với SQL Server.

- **Backend**: Express.js REST API (port 8000)
- **Frontend**: EJS templates (`src/views/`), giao diện tiếng Việt
- **Static assets**: CSS + logo trong `public/`
- **DB chính**: SQLite (local)
- **DB phụ**: SQL Server (optional, cho bảng biểu cước TRF_STD)

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
│   │   └── rate.routes.js           # Routes: /api/get_trf_std, /api/update_trf_std
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Handlers: login, logout, register, user CRUD; render login.ejs
│   │   ├── fuel.controller.js       # Handlers: getFuelPrice, getSurchargeTable
│   │   └── rate.controller.js       # Handlers: getTrfStd, updateTrfStd
│   │
│   ├── services/
│   │   ├── fuel.service.js          # Logic: gọi API ngoài + tính 6 loại container
│   │   └── rate.service.js          # Logic: đọc/cập nhật TRF_STD, validate trf_code
│   │
│   ├── models/
│   │   ├── user.model.js            # SQLite: CRUD bảng users (8 hàm promisified)
│   │   ├── fuelPrice.model.js       # SQLite: INSERT/SELECT bảng fuel_prices
│   │   └── rate.model.js            # SQL Server: SELECT/UPDATE bảng TRF_STD
│   │
│   ├── middleware/
│   │   ├── auth.js                  # Token store (Map), generateToken, authMiddleware, adminMiddleware
│   │   └── errorHandler.js          # Express error handler tập trung
│   │
│   ├── handle/
│   │   └── calculator_gasoline.js   # Bảng phụ thu + hàm tính toán
│   │
│   └── views/                       # EJS templates (thay thế view/ tĩnh cũ)
│       ├── index.ejs                # Dashboard chính (date picker → fetch → hiển thị phụ thu)
│       └── login.ejs                # Trang đăng nhập
│
├── public/
│   ├── css/
│   │   ├── index.css
│   │   └── login.css
│   └── logo.png
│
└── database/
    └── fuel_data.db                 # SQLite database file (committed to repo)
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
| GET | `/` | — | — | Render index.ejs (dashboard) |
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

---

## Ràng buộc quan trọng

1. **Không có migration script** — bảng SQLite phải tồn tại trước khi chạy app
2. **Bảng phụ thu hardcode** trong `src/handle/calculator_gasoline.js` — muốn thay đổi mức giá phải sửa trực tiếp file đó
3. **Mật khẩu plain text** trong SQLite — chưa có bcrypt/hash
4. **SQL Server là optional** — kết nối thất bại chỉ log warning, không crash app
5. **Token in-memory** — không persistent qua restart, không hỗ trợ multi-instance
6. **Toàn bộ UI/messages bằng tiếng Việt**
7. **Không có test suite** — verify bằng curl/Postman thủ công
