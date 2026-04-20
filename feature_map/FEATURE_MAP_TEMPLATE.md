# FEATURE_MAP_TEMPLATE.md

Đây là **khung chuẩn** để AI Agent tạo file `<TEN_TINH_NANG>_FEATURE_MAP.md` cho mỗi feature mới hoặc cập nhật feature hiện có.

> **Hướng dẫn sử dụng:**
> - Sao chép file này, đổi tên thành `<TEN_TINH_NANG>_FEATURE_MAP.md`
> - Điền nội dung vào từng section theo hướng dẫn trong `<!-- comment -->`
> - Xóa các comment hướng dẫn sau khi điền xong
> - Các section có nhãn `[BẮT BUỘC]` phải có. Nhãn `[NẾU CÓ]` chỉ thêm khi tính năng có phần đó.

---

## Tổng quan tính năng

<!-- [BẮT BUỘC] Bảng tóm tắt nhanh. Điền đầy đủ, giữ format table. -->
<!-- Thêm hoặc bớt hàng nếu tính năng có/không dùng API ngoài, SQL Server, thư viện ngoài, v.v. -->

| Mục | Nội dung |
|-----|---------|
| Tên tính năng | <!-- Tên ngắn gọn, ví dụ: "MPC Fuel Service" --> |
| Route UI | <!-- Ví dụ: `GET /`, `GET /zkteco` — hoặc "Không có UI" nếu chỉ là API --> |
| Phân quyền | <!-- Ví dụ: `user+`, `admin only`, hoặc liệt kê từng endpoint nếu khác nhau --> |
| Thư viện ngoài | <!-- Ví dụ: `axios`, `zkteco-js v1.7.0` — hoặc xóa hàng này nếu không có --> |
| API ngoài | <!-- URL API bên thứ ba nếu có — hoặc xóa hàng này --> |
| Database chính | <!-- Ví dụ: SQLite — bảng `ten_bang` --> |
| Database phụ | <!-- Ví dụ: SQL Server `PRD_MPC` — bảng `TRF_STD` (optional) — hoặc xóa hàng này --> |
| Logic đặc biệt | <!-- Ví dụ: hardcoded table, cron job, TCP socket — hoặc xóa hàng này --> |

---

## Bản đồ file

<!-- [BẮT BUỘC] Liệt kê TẤT CẢ file bị tác động. Phân biệt rõ "file mới tạo" và "file được sửa". -->

### File mới tạo

<!-- Nếu không có file mới, thay bằng: "> Không có file mới — tính năng này chỉ sửa file hiện có." -->

```
gasoline_prices/
├── src/
│   ├── routes/
│   │   └── <ten>.routes.js          ← <!-- mô tả ngắn: số endpoint, ví dụ "5 API endpoints" -->
│   ├── controllers/
│   │   └── <ten>.controller.js      ← <!-- liệt kê tên các handler -->
│   ├── services/
│   │   └── <ten>.service.js         ← <!-- mô tả business logic chính -->
│   ├── models/
│   │   └── <ten>.model.js           ← <!-- mô tả loại query và bảng DB -->
│   └── views/
│       └── <ten>.ejs                ← <!-- mô tả UI chính -->
│
└── public/
    └── css/
        └── <ten>.css                ← <!-- mô tả theme/style -->
```

### File được sửa

<!-- Nếu không có file nào bị sửa, thay bằng: "> Không có file hiện có nào bị sửa." -->

| File | Thay đổi |
|------|---------|
| `src/app.js` | <!-- Ví dụ: Import router mới, mount route, thêm view route --> |
| `src/config/db.js` | <!-- Ví dụ: Thêm CREATE TABLE IF NOT EXISTS --> |
| `src/views/menu.ejs` | <!-- Ví dụ: Thêm link menu mới --> |
| `PROJECT_STRUCTURE.md` | Cập nhật cây thư mục, bảng API, phần liên quan |
| `package.json` | <!-- Ví dụ: Thêm dependency `zkteco-js ^1.7.0` — xóa hàng này nếu không thêm package --> |

---

## Database

<!-- [BẮT BUỘC nếu có DB] Mô tả từng bảng DB mà tính năng đọc/ghi. -->
<!-- Tạo thêm sub-section nếu dùng nhiều loại DB (SQLite + SQL Server). -->
<!-- Nếu tính năng không đụng DB, thay section này bằng "> Tính năng này không đọc/ghi database." -->

### SQLite — bảng `<ten_bang>`

<!-- Ghi chú quan trọng về bảng: tự tạo hay phải tạo thủ công, có migration không. -->
> <!-- Ví dụ: "Được tạo tự động tại startup bằng CREATE TABLE IF NOT EXISTS." -->
> <!-- Hoặc: "Bảng phải tồn tại trước — không có migration script tự tạo." -->

| Cột | Kiểu | Default | Mô tả |
|-----|------|---------|-------|
| `id` | INTEGER | PK AUTOINCREMENT | Primary key |
| `<col>` | TEXT / REAL / INTEGER | <!-- default --> | <!-- mô tả --> |
| `created_at` | TEXT | — | ISO 8601 timestamp |
| `updated_at` | TEXT | — | ISO 8601 timestamp |

<!-- Ghi chú thêm nếu có ràng buộc đặc biệt: foreign key, unique, không deduplicate, v.v. -->

---

### SQL Server — `[<DB_NAME>].[dbo].[<TABLE>]`

<!-- [NẾU CÓ] Chỉ thêm section này nếu tính năng đọc/ghi SQL Server. -->
<!-- Ghi chú tính optional: "Nếu SQL Server không kết nối → ..." -->

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `<col>` | <!-- type --> | <!-- mô tả --> |

---

## API Endpoints

<!-- [BẮT BUỘC] Liệt kê tất cả HTTP endpoint thuộc tính năng này. -->

| Method | Route | Auth | Mô tả |
|--------|-------|------|-------|
| `GET` | `/api/<route>` | <!-- `user+` / `admin` / `—` --> | <!-- mô tả ngắn --> |
| `POST` | `/api/<route>` | <!-- auth --> | <!-- mô tả ngắn --> |
| `PUT` | `/api/<route>/:id` | <!-- auth --> | <!-- mô tả ngắn --> |
| `DELETE` | `/api/<route>/:id` | <!-- auth --> | <!-- mô tả ngắn --> |

<!-- Thêm chú thích chung nếu cần: ví dụ "Tất cả endpoints yêu cầu Authorization: Bearer <token>" -->

---

## Luồng dữ liệu (Request Flow)

<!-- [BẮT BUỘC] Vẽ luồng dữ liệu bằng ASCII cho từng use case chính của tính năng. -->
<!-- Mỗi use case là 1 sub-section. Không cần vẽ theo kiểu UML, dùng → và thụt lề là đủ. -->

### 1. <!-- Tên use case, ví dụ: "Tra cứu dữ liệu" -->

```
<!-- Ví dụ format:
User thao tác → click "<button>"
  → <METHOD> /api/<route>?<params>
  → <ten>.routes.js  [middleware]
  → <ten>.controller.<handler>()
      → <ten>.service.<method>(params)
          → gọi API ngoài / DB query / thư viện
          → xử lý kết quả
      → model.insert/update/select(db, data)
  → res.json({ ... })
  → <ten>.ejs render kết quả vào DOM
-->
```

### 2. <!-- Tên use case tiếp theo nếu có -->

```
<!-- Tương tự -->
```

---

## Validation & Error Codes

<!-- [BẮT BUỘC] Liệt kê tất cả trường hợp lỗi và HTTP status code tương ứng. -->

| Tình huống | HTTP | Nơi xử lý | Message (VI) |
|---|---|---|---|
| <!-- mô tả điều kiện --> | 400 | `<ten>.service` / `<ten>.controller` | `"<message tiếng Việt>"` |
| <!-- mô tả điều kiện --> | 404 | <!-- nơi xử lý --> | `"<message>"` |
| <!-- mô tả điều kiện --> | 500 | <!-- nơi xử lý --> | `"<message>"` |
| <!-- mô tả điều kiện --> | 503 | <!-- nếu liên quan kết nối ngoài --> | `"<message>"` |

---

## UI (`<ten>.ejs`) — Layout

<!-- [NẾU CÓ] Chỉ thêm nếu tính năng có giao diện người dùng. -->
<!-- Vẽ layout bằng ASCII box để AI/developer hình dung nhanh cấu trúc màn hình. -->

```
┌─────────────────────────────────────────────────────────┐
│ ← Menu   [logo] <Tên trang>                             │  ← page-header
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ <!-- Mô tả card/section 1 -->                           │  ← card (form / table / v.v.)
│  [<element>]  [<element>]                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ <!-- Mô tả card/section 2 -->                           │
└─────────────────────────────────────────────────────────┘
```

### Luồng khởi tạo UI

<!-- Mô tả những gì xảy ra khi trang load lần đầu (DOMContentLoaded). -->

```
DOMContentLoaded
  ├── fetch /api/me → nếu 401 → redirect /login
  ├── <!-- bước khởi tạo khác -->
  └── <!-- fetch dữ liệu ban đầu -->
```

---

## Module / Logic đặc biệt

<!-- [NẾU CÓ] Thêm section này nếu tính năng có logic phức tạp, hardcoded data,
     thuật toán tính toán, hoặc giao tiếp protocol đặc biệt (TCP, ZKTeco, v.v.). -->
<!-- Mô tả input/output, cấu trúc dữ liệu hardcoded, và cách dùng. -->

### `<đường dẫn file>`

<!-- Ví dụ: bangPhuThu[], tinhGiaCuocTheoDauDO(), TCP socket flow, v.v. -->

```
Input:  <!-- mô tả tham số -->
Output: <!-- mô tả kết quả trả về -->
Dùng:   <!-- ai gọi hàm/module này -->
```

---

## API ngoài

<!-- [NẾU CÓ] Chỉ thêm nếu tính năng gọi API bên thứ ba. -->

```
<METHOD> <URL_PATTERN>

Request:  <!-- body / query params nếu có -->

Response:
<!-- Mô tả cấu trúc response JSON -->

Target: <!-- Trường cụ thể mà tính năng quan tâm trong response -->
```

**Cấu hình qua `.env`:**
- `<ENV_VAR>` — <!-- mô tả, default value -->

---

## Phụ thuộc & Ràng buộc quan trọng

<!-- [BẮT BUỘC] Liệt kê những điểm dễ gây bug nếu không biết. -->
<!-- Ưu tiên: hardcoded values, side effects, async gotchas, optional dependencies, security. -->

| Mục | Chi tiết |
|-----|---------|
| <!-- tên ràng buộc --> | <!-- giải thích đủ để tránh lỗi --> |
| <!-- tên ràng buộc --> | <!-- giải thích --> |

---

## Các file KHÔNG bị tác động

<!-- [BẮT BUỘC] Giúp AI agent biết rõ phạm vi — không sửa nhầm. -->
<!-- Liệt kê các file cùng layer (routes, controllers, v.v.) nhưng thuộc feature khác. -->

Tính năng này **không sửa** các file sau:

- `src/routes/` — <!-- liệt kê file không liên quan -->
- `src/controllers/` — <!-- liệt kê -->
- `src/services/` — <!-- liệt kê -->
- `src/models/` — <!-- liệt kê -->
- `src/middleware/auth.js`, `errorHandler.js`
- `src/views/` — <!-- liệt kê -->
- `public/css/` — <!-- liệt kê -->
- <!-- các file khác không bị tác động -->
