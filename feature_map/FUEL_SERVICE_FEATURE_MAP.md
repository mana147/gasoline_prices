# FUEL_SERVICE_FEATURE_MAP.md

Tài liệu này mô tả toàn bộ phạm vi tính năng **MPC Fuel Service** — dành cho AI agents hoặc developer cần hiểu nhanh feature này tác động đến những gì trong codebase.

---

## Tổng quan tính năng

| Mục | Nội dung |
|-----|---------|
| Tên tính năng | MPC Fuel Service |
| Route UI | `GET /` |
| Phân quyền | Tra cứu giá dầu: `user+` — Xem TRF_STD: `user+` — Cập nhật TRF_STD: `admin only` |
| API ngoài | `https://giaxanghomnay.com/api/pvdate/{date}` |
| Database chính | SQLite — bảng `fuel_prices` |
| Database phụ | SQL Server `PRD_MPC` — bảng `TRF_STD` (optional) |
| Logic tính toán | Hardcoded trong `src/handle/calculator_gasoline.js` |

---

## Bản đồ file

### File thuộc về tính năng này

```
gasoline_prices/
├── src/
│   ├── routes/
│   │   ├── fuel.routes.js            ← 2 endpoints: /api/get_fuel_price, /api/get_surcharge_table
│   │   └── rate.routes.js            ← 2 endpoints: /api/get_trf_std, /api/update_trf_std
│   │
│   ├── controllers/
│   │   ├── fuel.controller.js        ← getFuelPrice (gọi service + lưu DB), getSurchargeTable
│   │   └── rate.controller.js        ← getTrfStd, updateTrfStd
│   │
│   ├── services/
│   │   ├── fuel.service.js           ← gọi API ngoài (axios), lọc "DO 0,05S-II", tính 6 loại phụ thu
│   │   └── rate.service.js           ← validate trf_code, kết nối SQL Server, format response
│   │
│   ├── models/
│   │   ├── fuelPrice.model.js        ← SQLite INSERT/SELECT bảng fuel_prices
│   │   └── rate.model.js             ← SQL Server SELECT/UPDATE bảng TRF_STD (4 rowguid cố định)
│   │
│   ├── handle/
│   │   └── calculator_gasoline.js    ← bangPhuThu[] (10 mức, hardcoded) + tinhGiaCuocTheoDauDO()
│   │
│   └── views/
│       └── index.ejs                 ← Toàn bộ UI: tra cứu + hiển thị TRF_STD + cập nhật TRF_STD + bảng phụ thu
│
└── public/
    └── css/
        └── index.css                 ← Styles cho trang index
```

### File liên quan (không chứa logic nhưng bị gọi)

| File | Vai trò |
|------|---------|
| `src/config/db.js` | Cung cấp `sqlite_db` và `mssqlConfig` |
| `src/middleware/auth.js` | `authMiddleware` (fuel, rate GET), `adminMiddleware` (rate POST) |
| `src/app.js` | Mount `fuelRouter` và `rateRouter`; khai báo view route `GET /` |

---

## Database

### SQLite — bảng `fuel_prices`

> **Lưu ý**: Bảng phải tồn tại trước — không có migration script tự tạo.

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `date` | TEXT | Ngày lấy giá `YYYY-MM-DD` |
| `brand` | TEXT | Luôn là `"petrolimex"` |
| `title` | TEXT | Luôn là `"DO 0,05S-II"` |
| `zone1_price` | REAL | Giá vùng 1 (VNĐ) |
| `zone2_price` | REAL | Giá vùng 2 (VNĐ) |
| `hang_20` | REAL | Phụ thu container hàng 20' |
| `hang_40` | REAL | Phụ thu container hàng 40' |
| `hang_45` | REAL | Phụ thu container hàng 45' |
| `rong_20` | REAL | Phụ thu container rỗng 20' |
| `rong_40` | REAL | Phụ thu container rỗng 40' |
| `rong_45` | REAL | Phụ thu container rỗng 45' |
| `status` | TEXT | Luôn là `"active"` |
| `createdAt` | TEXT | ISO 8601 timestamp |

**Chỉ ghi, không đọc lại**: `fuelPrice.model.js` chỉ có `insertFuelPrice` và `findFuelPrice` — UI không hiển thị lịch sử từ DB, mỗi tra cứu gọi API ngoài rồi INSERT thêm bản ghi mới (có thể trùng date).

---

### SQL Server — `[PRD_MPC].[dbo].[TRF_STD]`

> **Optional**: Nếu SQL Server không kết nối được → app vẫn chạy, chỉ phần TRF_STD bị lỗi.

4 bản ghi cố định, tra cứu và cập nhật bằng `rowguid` hardcoded trong `rate.model.js`:

| `TRF_CODE` | `rowguid` | Loại | Cột dùng |
|-----------|-----------|------|---------|
| `NH` | `ec426c93-...` | Nội hàng | `AMT_F20`, `AMT_F40`, `AMT_F45` |
| `HH` | `d5af4366-...` | Hoàn hàng | `AMT_F20`, `AMT_F40`, `AMT_F45` |
| `NR` | `084e21e5-...` | Nội rỗng | `AMT_E20`, `AMT_E40`, `AMT_E45` |
| `HR` | `e4f41ae6-...` | Hoàn rỗng | `AMT_E20`, `AMT_E40`, `AMT_E45` |

---

## API Endpoints

| Method | Route | Auth | Mô tả |
|--------|-------|------|-------|
| `GET` | `/api/get_fuel_price?date=YYYY-MM-DD` | `user+` | Gọi API ngoài, tính phụ thu, lưu SQLite, trả JSON |
| `GET` | `/api/get_surcharge_table` | — | Trả trực tiếp `bangPhuThu[]` từ bộ nhớ (không DB) |
| `GET` | `/api/get_trf_std` | `user+` | Đọc 4 bản ghi TRF_STD từ SQL Server |
| `POST` | `/api/update_trf_std` | `admin` | Cập nhật NH+HH hoặc NR+HR trong SQL Server |

---

## Luồng dữ liệu (Request Flow)

### 1. Tra cứu giá dầu & tính phụ thu

```
User chọn ngày → click "Tra cứu giá xăng dầu"
  → GET /api/get_fuel_price?date=YYYY-MM-DD
  → fuel.routes.js  [authMiddleware]
  → fuel.controller.getFuelPrice()
      → date = req.query.date || today
      → fuel.service.fetchAndCalculateFuelPrice(date)
          → axios.get("giaxanghomnay.com/api/pvdate/{date}")
              Response: [petrolimexToday[], pvoilToday[], petrolimexPrev[], pvoilPrev[]]
          → getFuelByTitle(data, "petrolimex", "DO 0,05S-II")
              → lọc item có title === "DO 0,05S-II" trong mảng petrolimex
              → lấy zone1_price, zone2_price
          → tinhGiaCuocTheoDauDO(zone1_price, "hang_20"|"hang_40"|..., 0)  × 6 lần
              → bangPhuThu.find(item => giaDO >= item.min && giaDO <= item.max)
              → trả { phuThu: number }
      → fuelPriceModel.insertFuelPrice(sqlite_db, record)  ← ghi vào SQLite
  → res.json({ date, brand, title, zone1_price, zone2_price, hang_20..45, rong_20..45 })
  → index.ejs render kết quả vào DOM
```

### 2. Xem bảng phụ thu (tĩnh)

```
DOMContentLoaded → loadSurchargeTable()
  → GET /api/get_surcharge_table  (không cần auth)
  → fuel.controller.getSurchargeTable()
      → res.json(bangPhuThu)  ← trả thẳng array từ memory, không qua DB
  → index.ejs renderSurchargeTable(data)  ← hiện bảng 10 mức giá
```

### 3. Xem biểu cước TRF_STD

```
DOMContentLoaded (500ms delay) → loadTrfStdData()
  → GET /api/get_trf_std  [authMiddleware]
  → rate.controller.getTrfStd()
      → rate.service.getRates()
          → ms_sql.connect(mssqlConfig)
          → rate.model.getTrfStd(pool)  ← SELECT 4 rows WHERE rowguid IN (...)
          → format: { NH: {hang_20, hang_40, hang_45}, HH: {...}, NR: {...}, HR: {...} }
  → res.json(formatted)
  → index.ejs renderTrfStdData(data)  ← hiện HH/NH cho container hàng, NR/HR cho rỗng
```

### 4. Cập nhật TRF_STD (Admin)

```
User nhập giá trị → click "Cập nhật NH + HH" (hoặc "NR + HR")
  → index.ejs gọi 2 lần POST (NH rồi HH, hoặc NR rồi HR)
  → POST /api/update_trf_std  { trf_code: "NH", hang_20, hang_40, hang_45 }
  → rate.routes.js  [authMiddleware + adminMiddleware]
  → rate.controller.updateTrfStd()
      → rate.service.updateRate(trf_code, values)
          → validate: trf_code ∈ ['NH','HH','NR','HR']
          → validate: NH/HH cần hang_*, NR/HR cần rong_*
          → ms_sql.connect(mssqlConfig)
          → rate.model.updateTrfStd(pool, trf_code, params)
              → QUERIES[trf_code].sql  ← UPDATE ... WHERE rowguid = '...'
              → request.input('AMT_F20', Decimal(18,2), value)  × 3
  → res.json({ success, message, rowsAffected })
  → index.ejs gọi lại loadTrfStdData() để refresh
```

---

## Module tính toán: `src/handle/calculator_gasoline.js`

### `bangPhuThu[]` — 10 phần tử hardcoded

| Mức | Khoảng giá DO (VNĐ) | hang_20 | hang_40 | hang_45 | rong_20 | rong_40 | rong_45 |
|-----|---------------------|---------|---------|---------|---------|---------|---------|
| 1 | 0 – 23.000 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | 23.001 – 26.000 | 50.000 | 60.000 | 60.000 | 35.000 | 50.000 | 50.000 |
| 3 | 26.001 – 29.000 | 100.000 | 120.000 | 120.000 | 70.000 | 100.000 | 100.000 |
| 4 | 29.001 – 32.000 | 150.000 | 180.000 | 180.000 | 105.000 | 150.000 | 150.000 |
| 5 | 32.001 – 35.000 | 200.000 | 240.000 | 240.000 | 140.000 | 200.000 | 200.000 |
| 6 | 35.001 – 38.000 | 250.000 | 300.000 | 300.000 | 175.000 | 250.000 | 250.000 |
| 7 | 38.001 – 41.000 | 300.000 | 360.000 | 360.000 | 210.000 | 300.000 | 300.000 |
| 8 | 41.001 – 44.000 | 350.000 | 420.000 | 420.000 | 245.000 | 350.000 | 350.000 |
| 9 | 44.001 – 47.000 | 400.000 | 480.000 | 480.000 | 280.000 | 400.000 | 400.000 |
| 10 | 47.001 – 50.000 | 450.000 | 540.000 | 540.000 | 315.000 | 450.000 | 450.000 |

> **Giá ngoài 0–50.000**: `tinhGiaCuocTheoDauDO()` throw `Error("Giá dầu DO ngoài phạm vi bảng phụ thu")`.

### `tinhGiaCuocTheoDauDO(giaDauDO, loaiContainer, giaCuoc)`

```
Input:  giaDauDO (number, VNĐ)  |  loaiContainer (string)  |  giaCuoc (luôn truyền 0)
Output: { giaDauDO, loaiContainer, giaCuoc, phuThu, tongTien }
Dùng:   fuel.service.js gọi × 6 lần, lấy .phuThu
```

**Loại container hợp lệ**: `"hang_20"`, `"hang_40"`, `"hang_45"`, `"rong_20"`, `"rong_40"`, `"rong_45"`

---

## Validation & Error Codes

| Tình huống | HTTP | Nơi xử lý | Message |
|---|---|---|---|
| Ngày không hợp lệ (`isNaN(Date.parse)`) | — | `fuel.controller` | Fallback về ngày hôm nay |
| API ngoài không trả về | 500 | `fuel.controller` catch | `"Failed to fetch fuel price"` |
| Giá DO > 50.000 hoặc < 0 | 500 | `calculator_gasoline` throw | `"Giá dầu DO ngoài phạm vi"` |
| `trf_code` không hợp lệ | 400 | `rate.service` | `"Invalid trf_code. Must be one of: NH, HH, NR, HR"` |
| NH/HH thiếu `hang_*` | 400 | `rate.service` | `"NH requires hang_20, hang_40, hang_45 values"` |
| NR/HR thiếu `rong_*` | 400 | `rate.service` | `"NR requires rong_20, rong_40, rong_45 values"` |
| SQL Server không kết nối | 500 | `rate.controller` catch | `"Failed to fetch/update TRF_STD data"` |

---

## UI (index.ejs) — Layout các section

```
┌───────────────────────────────────────────────────────┐
│ ← Menu   [logo] MPC Fuel Service                      │  ← page-header
│ "Chọn ngày để lấy dữ liệu giá dầu..."                │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ 📋 Chọn ngày: [date input]  [Tra cứu giá xăng dầu]  │  ← card (form)
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ [loading spinner / error / result]                    │  ← 3 card toggle (hidden/visible)
│  Result: brand, title, zone1_price, zone2_price       │
│  Phụ thu Hàng: hang_20 / hang_40 / hang_45            │
│  Phụ thu Rỗng: rong_20 / rong_40 / rong_45            │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ 🏷️ Biểu Cước TRF_STD (PLTOS)      [🔄 Làm mới]      │  ← card (TRF_STD view)
│  Container Hàng (HH+NH): 20'/40'/45'                 │
│  Container Rỗng (NR+HR): 20'/40'/45'                 │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ ✏️ Cập nhật TRF_STD         [📋 Copy từ kết quả]     │  ← card (update form, admin)
│  [Container Hàng NH+HH]  [Container Rỗng NR+HR]      │
│  inputs 20'/40'/45'  →  [Cập nhật NH+HH / NR+HR]    │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ 📋 Bảng phụ thu theo giá dầu                         │  ← card (surcharge table)
│  Bảng 10 hàng × 7 cột (giá DO | 6 loại container)   │
└───────────────────────────────────────────────────────┘
```

### Luồng khởi tạo UI

```
DOMContentLoaded
  ├── fetch /api/me → nếu 401/lỗi → redirect /login
  ├── set dateInput = today
  ├── loadSurchargeTable()   ← GET /api/get_surcharge_table (public)
  └── setTimeout 500ms → loadTrfStdData()  ← GET /api/get_trf_std (auth)
```

### Chức năng "Copy từ kết quả tra cứu"

`copyFromResult()` — đọc text từ `#hang20..45` và `#rong20..45`, parse số nguyên (strip "đ" và dấu phẩy), điền vào form cập nhật TRF_STD. Chỉ hoạt động sau khi đã tra cứu thành công.

---

## API ngoài: `giaxanghomnay.com`

```
GET https://giaxanghomnay.com/api/pvdate/{YYYY-MM-DD}

Response: [
    petrolimexToday[],   // index 0 — dùng cái này
    pvoilToday[],        // index 1 — bỏ qua
    petrolimexPrev[],    // index 2 — bỏ qua
    pvoilPrev[]          // index 3 — bỏ qua
]

Mỗi item trong mảng:
{
    id, date, title, zone1_price, zone2_price, ...
}

Target item: title === "DO 0,05S-II"
```

**Cấu hình qua `.env`:**
- `API_BASE_URL` — default `https://giaxanghomnay.com/api/pvdate/`
- `API_TIMEOUT` — default `10000` ms

---

## Phụ thuộc & Ràng buộc quan trọng

| Mục | Chi tiết |
|-----|---------|
| Bảng phụ thu hardcoded | `bangPhuThu` trong `calculator_gasoline.js` — **không** lưu DB, muốn sửa mức giá phải edit file trực tiếp |
| Không deduplicate | Mỗi lần tra cứu cùng `date` sẽ INSERT thêm 1 row mới vào `fuel_prices` — không có `ON CONFLICT` |
| SQL Server optional | Nếu MSSQL không kết nối → `getTrfStd` và `updateTrfStd` sẽ throw 500, nhưng tra cứu giá dầu vẫn hoạt động |
| Update TRF_STD gọi 2 lần | Client gọi `POST /api/update_trf_std` 2 lần liên tiếp (NH + HH, hoặc NR + HR) trong cùng 1 nút bấm |
| `giaCuoc` luôn là 0 | `tinhGiaCuocTheoDauDO` nhận `giaCuoc=0` — `tongTien = 0 + phuThu = phuThu` |
| Auth check client-side | `/` không có server-side auth guard — redirect xử lý bằng JS trong `index.ejs` |
| Cập nhật TRF_STD chỉ dành admin | Non-admin bị block ở `adminMiddleware` (403), nút cập nhật vẫn hiển thị trên UI nhưng API trả lỗi |

---

## Các file KHÔNG bị tác động

Tính năng này **không sửa** các file sau:

- `src/routes/auth.routes.js`, `zkteco.routes.js`
- `src/controllers/auth.controller.js`, `zkteco.controller.js`
- `src/services/zkteco.service.js`
- `src/models/user.model.js`, `zkteco.model.js`
- `src/middleware/auth.js`, `errorHandler.js`
- `src/views/menu.ejs`, `login.ejs`, `zkteco.ejs`
- `public/css/menu.css`, `login.css`, `zkteco.css`
- `database/fuel_data.db` schema (bảng `fuel_prices` phải tạo thủ công trước)
