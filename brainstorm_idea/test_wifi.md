# WiFi AP SNMP Discovery Runbook

> **Dành cho AI Agent:** Đây là quy trình chuẩn để khám phá và xác nhận OID SNMP của một model WiFi AP mới,  
> trước khi tích hợp vào service monitoring chính thức (xem `WIFI_MONITORING_PLAN.md`).  
> Thực thi tuần tự từng bước — không skip, không suy đoán OID mà không test.

---

## Mục lục

1. [Điều kiện tiên quyết](#1-điều-kiện-tiên-quyết)
2. [Bước 1 — Kiểm tra kết nối cơ bản](#2-bước-1--kiểm-tra-kết-nối-cơ-bản)
3. [Bước 2 — Walk MIB sâu](#3-bước-2--walk-mib-sâu)
4. [Bước 3 — Xác minh OID client count](#4-bước-3--xác-minh-oid-client-count)
5. [Bước 4 — Phân tích kết quả](#5-bước-4--phân-tích-kết-quả)
6. [Bước 5 — Ghi vào OID Catalog](#6-bước-5--ghi-vào-oid-catalog)
7. [OID Catalog — Model đã xác nhận](#7-oid-catalog--model-đã-xác-nhận)
8. [OID chuẩn thử trước (vendor-agnostic)](#8-oid-chuẩn-thử-trước-vendor-agnostic)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Điều kiện tiên quyết

```bash
# Packages cần có
npm install ping net-snmp

# Scripts cần có (trong thư mục scripts/)
scripts/test_snmp_wifi.js       # Bước 1 — ping + GET cơ bản
scripts/test_snmp_walk.js       # Bước 2 — walk MIB sâu
scripts/test_snmp_clients.js    # Bước 3 — xác minh OID client count
```

**Thông tin cần biết trước:**
- IP của AP cần test (ít nhất 1 IP đang up)
- SNMP community string (thử `public` trước)
- SNMP version (mặc định dùng v2c)

---

## 2. Bước 1 — Kiểm tra kết nối cơ bản

**Mục đích:** Xác nhận AP có ping được và SNMP phản hồi. Thu thập thông tin model/firmware.

```bash
node scripts/test_snmp_wifi.js [community] [ip1] [ip2] ...

# Ví dụ:
node scripts/test_snmp_wifi.js public 192.168.1.10
node scripts/test_snmp_wifi.js public 172.16.82.2 172.16.82.3 172.16.82.4
```

**OID được GET trong bước này (MIB-II chuẩn):**

| OID | Tên | Mô tả |
|-----|-----|-------|
| `1.3.6.1.2.1.1.1.0` | sysDescr | Mô tả thiết bị, firmware |
| `1.3.6.1.2.1.1.3.0` | sysUpTime | Uptime (timeticks, ÷100 = giây) |
| `1.3.6.1.2.1.1.5.0` | sysName | Hostname |
| `1.3.6.1.2.1.1.6.0` | sysLocation | Vị trí |
| `1.3.6.1.2.1.2.1.0` | ifNumber | Số lượng interface |

**Kết quả mong đợi:**
```
--- 192.168.1.10 ---
  PING     : UP (5ms)
  sysDescr : <model name / firmware>
  sysUpTime: <Xd Xh Xm>
  sysName  : <hostname>
```

**Nếu PING UP nhưng SNMP FAIL:**
- Thử community string khác: `private`, `admin`, `altai`, `cisco` ...
- Vào web UI AP → Management → SNMP → bật SNMP v2c
- Kiểm tra firewall có block UDP/161 không

**Ghi lại sau bước này:**
- [ ] Community string hoạt động: `___________`
- [ ] `sysDescr` = `___________` (model/firmware)
- [ ] `1.3.6.1.2.1.1.2.0` (sysObjectID) = `___________` → tra ra Enterprise OID prefix

---

## 3. Bước 2 — Walk MIB sâu

**Mục đích:** Khám phá toàn bộ OID tree của thiết bị. Tìm vị trí client table và các metric.

### 2.1. Cập nhật `WALK_TARGETS` trong `test_snmp_walk.js`

Mở file `scripts/test_snmp_walk.js` và chỉnh `WALK_TARGETS`:

```javascript
const WALK_TARGETS = [
    // Luôn walk 3 nhánh này trước (chuẩn, hoạt động trên mọi AP)
    { oid: '1.3.6.1.2.1.1',    desc: 'System Info',     maxRows: 50  },
    { oid: '1.3.6.1.2.1.2.2',  desc: 'Interface Table', maxRows: 200 },
    { oid: '1.2.840.10036',     desc: 'IEEE 802.11 MIB', maxRows: 200 },

    // Thay X bằng Enterprise OID prefix của thiết bị (từ sysObjectID ở Bước 1)
    // Ví dụ: Altai = 27586, Ubiquiti = 41112, TP-Link = 11863, MikroTik = 14988
    { oid: '1.3.6.1.4.1.X',    desc: 'Enterprise MIB',  maxRows: 60  },
    { oid: '1.3.6.1.4.1.X.7.2',desc: 'Enterprise 7.2',  maxRows: 200 },
    { oid: '1.3.6.1.4.1.X.7.3',desc: 'Enterprise 7.3',  maxRows: 100 },
    { oid: '1.3.6.1.4.1.X.7.4',desc: 'Enterprise 7.4',  maxRows: 200 },
];
```

> **Gợi ý Enterprise OID prefix:** Lấy từ `sysObjectID` ở Bước 1.  
> Ví dụ: `1.3.6.1.4.1.27586.3.2.10` → prefix là `1.3.6.1.4.1.27586`

```bash
node scripts/test_snmp_walk.js [ip] [community]
```

### 2.2. Phân tích kết quả walk

**Đặc điểm của client/station table:**
- Là bảng SNMP (OID có dạng `prefix.tableOid.1.columnIdx.rowIdx`)
- Số lượng row thay đổi theo số client kết nối (nếu test lúc khác nhau)
- Thường có cột chứa: MAC address (hex 6 bytes), RSSI (số âm, dBm), TX/RX counters, association state

**Đặc điểm cột "active flag":**
- Row đang có client: giá trị != 0 (thường = 1, 2)
- Row trống/inactive: giá trị = 0

**Đặc điểm cột RSSI:**
- Row đang có client: giá trị âm, trong khoảng -30 đến -95 dBm
- Row trống: bằng giá trị noise floor (ví dụ: -96, -95) hoặc = 0

**Các thứ cần tìm và ghi lại:**
- [ ] Nhánh enterprise: `1.3.6.1.4.1.___________`
- [ ] OID bảng station/client: `___________`
- [ ] Cột "active flag" (đoán): `___________`
- [ ] Cột RSSI (đoán): `___________`
- [ ] Cột MAC address (đoán): `___________`

---

## 4. Bước 3 — Xác minh OID client count

**Mục đích:** Chạy trên toàn bộ AP, đối chiếu các phương pháp, chọn OID đúng.

### 3.1. Cập nhật `test_snmp_clients.js`

Mở `scripts/test_snmp_clients.js`, chỉnh phần `OID`:

```javascript
const OID = {
    // Điền OID tìm được từ Bước 2
    candidate_count:     '1.3.6.1.4.1.X.Y.Z.0',   // scalar candidate
    station_tbl_size:    '1.3.6.1.4.1.X.Y.W.0',   // table size scalar

    station_active_col:  '1.3.6.1.4.1.X.Y.T.1.6', // cột active flag
    station_rssi_col:    '1.3.6.1.4.1.X.Y.T.1.N', // cột RSSI
    station_tx_col:      '1.3.6.1.4.1.X.Y.T.1.M', // cột TX frames
};
```

Điều chỉnh ngưỡng RSSI nếu cần (default = -96):
```javascript
const activeRssi = rssiList.filter(v => Number(v) > -96 && Number(v) < 0);
```

```bash
node scripts/test_snmp_clients.js [community] [ip1] [ip2] ...
```

### 3.2. Phân tích bảng so sánh

Xem cột nào **nhất quán** nhất khi so sánh giữa các AP:

```
IP         | scalar | tbl_size | flag>0 | rssi>threshold
```

**Tiêu chí chọn OID tốt:**
1. Giá trị thay đổi giữa AP khác nhau (không cố định = 2 mãi)
2. Khi không có client = 0 (hoặc rất thấp)
3. Khi có client = số dương phù hợp

**Thứ tự ưu tiên:**

```
Scalar GET (đơn giản nhất)
    ↓ nếu không tin cậy
Walk + count(flag > 0)  ← phổ biến nhất
    ↓ nếu flag không rõ
Walk + count(rssi trong ngưỡng)
    ↓ nếu RSSI threshold khó xác định
Không có client count → để trống snmp_client_oid trong DB
```

---

## 5. Bước 4 — Phân tích kết quả

**Câu hỏi kiểm tra trước khi kết luận:**

- [ ] OID client count cho giá trị = 0 khi AP không có ai kết nối?
- [ ] OID client count tăng khi thêm thiết bị kết nối WiFi?
- [ ] `flag>0` và `rssi>threshold` cho cùng kết quả trên đa số AP?
- [ ] OID uptime (`1.3.6.1.2.1.1.3.0`) hoạt động đúng?

**Nếu muốn test thêm:** Kết nối 1 thiết bị vào WiFi → chạy lại script → số client phải tăng 1.

---

## 6. Bước 5 — Ghi vào OID Catalog

Sau khi xác nhận, điền vào bảng **OID Catalog** bên dưới theo format đã có.

---

## 7. OID Catalog — Model đã xác nhận

### Altai WA8011NAC-X (SuperWifi A8, 4-sector)

| Thông tin | Giá trị |
|-----------|---------|
| **Model** | WA8011NAC-X |
| **Firmware test** | 2.2.0.1919.HKE46 (build 2019-09-14) |
| **Enterprise OID prefix** | `1.3.6.1.4.1.27586` |
| **SNMP version** | v2c |
| **Community mặc định** | `public` |
| **sysObjectID** | `1.3.6.1.4.1.27586.3.2.10` |

| Metric | OID | Phương pháp | Ghi chú |
|--------|-----|-------------|---------|
| **Uptime** | `1.3.6.1.2.1.1.3.0` | GET scalar | Timeticks ÷ 100 = giây |
| **Client count** | `1.3.6.1.4.1.27586.7.4.2.2.1.6` | **Walk + count(>0)** | Active flag per slot; scalar `7.3.1.0` không dùng được (hằng số = 2) |
| **Client RSSI** | `1.3.6.1.4.1.27586.7.4.2.2.1.19` | Walk | dBm; -96 = empty slot (noise floor) |
| **Model name** | `1.3.6.1.4.1.27586.7.1.1.1.0` | GET scalar | "WA8011NAC-X" |
| **Full AP name** | `1.3.6.1.4.1.27586.7.1.1.16.0` | GET scalar | "TC15 - Altai A8" |
| **Serial** | `1.3.6.1.4.1.27586.7.1.1.15.0` | GET scalar | "1AN1938D0035" |
| **Firmware** | `1.3.6.1.4.1.27586.7.1.1.5.0` | GET scalar | "2.2.0.1919.HKE46" |
| **Radio MAC** | `1.3.6.1.4.1.27586.7.1.3.1.1.17.X` | GET, X=1/2 | MAC của từng radio sector |
| **Radio TX power** | `1.3.6.1.4.1.27586.7.1.3.1.1.6.X` | GET, X=1/2 | dBm |

**Đặc điểm quan trọng (cho AI Agent kế tiếp):**
- Client count **phải dùng Walk** không phải GET — không có scalar đáng tin
- `active_flag = 1` → slot có client; `= 0` → slot trống
- `rssi = -96` thường là noise floor = không có client, nhưng AP.7 có flag=1 với rssi=-96 → không dùng RSSI làm chỉ tiêu duy nhất
- AP .4 và .5 cùng sysName "TC08"; .7 và .8 cùng "TC06" — đặt tên riêng trong DB
- AP .8 uptime chỉ 6h — vừa reboot, cần theo dõi

---

### Template — Model mới (copy và điền)

```
### [Vendor] [Model] ([Mô tả ngắn])

| Thông tin | Giá trị |
|-----------|---------|
| **Model** | |
| **Firmware test** | |
| **Enterprise OID prefix** | `1.3.6.1.4.1.___` |
| **SNMP version** | v2c |
| **Community mặc định** | `public` |
| **sysObjectID** | |
| **Test date** | |

| Metric | OID | Phương pháp | Ghi chú |
|--------|-----|-------------|---------|
| **Uptime** | `1.3.6.1.2.1.1.3.0` | GET scalar | Chuẩn, luôn hoạt động |
| **Client count** | | | |
| **Client RSSI** | | | |
| **Model name** | | | |

**Đặc điểm quan trọng:**
-
```

---

## 8. OID chuẩn thử trước (vendor-agnostic)

Các OID này thường hoạt động trên mọi AP có SNMP — thử trước khi đào sâu enterprise MIB:

### MIB-II chuẩn (RFC 1213)

| OID | Tên | Mô tả |
|-----|-----|-------|
| `1.3.6.1.2.1.1.1.0` | sysDescr | Mô tả đầy đủ thiết bị |
| `1.3.6.1.2.1.1.2.0` | sysObjectID | **Enterprise prefix** — đọc cái này trước |
| `1.3.6.1.2.1.1.3.0` | sysUpTime | Uptime |
| `1.3.6.1.2.1.1.4.0` | sysContact | Contact admin |
| `1.3.6.1.2.1.1.5.0` | sysName | Hostname |
| `1.3.6.1.2.1.1.6.0` | sysLocation | Vị trí |
| `1.3.6.1.2.1.2.1.0` | ifNumber | Số interface |

### IEEE 802.11 MIB (không phải vendor nào cũng implement đầy đủ)

| OID | Tên | Mô tả |
|-----|-----|-------|
| `1.2.840.10036.1.1.1.9.X` | dot11DesiredSSID | SSID theo ifIndex |
| `1.2.840.10036.3.1.2.1.1.X` | dot11StationID | MAC address radio |
| `1.2.840.10036.2.1.1.2.X` | dot11BeaconPeriod | Beacon interval |

### Enterprise OID prefix phổ biến

| Vendor | Enterprise OID Prefix | Ghi chú |
|--------|----------------------|---------|
| **Altai Technologies** | `1.3.6.1.4.1.27586` | Đã xác nhận |
| Ubiquiti (UniFi) | `1.3.6.1.4.1.41112` | |
| TP-Link Omada | `1.3.6.1.4.1.11863` | |
| MikroTik | `1.3.6.1.4.1.14988` | |
| Cisco (WLC) | `1.3.6.1.4.1.9` | Rất phức tạp |
| Aruba/HP | `1.3.6.1.4.1.14823` | |
| Ruijie | `1.3.6.1.4.1.36228` | |
| Cambium/Motorola | `1.3.6.1.4.1.17713` | |

---

## 9. Troubleshooting

### SNMP FAIL trên tất cả AP

```
SNMP: FAIL — Timeout
```

Kiểm tra theo thứ tự:
1. **Community string sai** → thử: `public`, `private`, `admin`, tên công ty, tên model
2. **SNMP chưa bật** → vào web UI AP → Management → SNMP → enable v2c
3. **Firewall block UDP/161** → `nc -zu <ip> 161` để test
4. **AP chỉ hỗ trợ v3** → cần credential v3 (username, authKey, privKey)

### SNMP OK nhưng OID client count luôn = 0

- Thời điểm test không có client nào kết nối → kết nối 1 thiết bị và test lại
- Walk sai nhánh MIB → thử walk enterprise OID sâu hơn
- AP dùng OID khác → thử `1.3.6.1.2.1.2.2.1.2` (ifDescr) để xem interface list, tìm interface `wlan`/`ath`/`wifi`

### OID walk trả về `[hex X B]` không đọc được

- Đây là binary data (MAC address, key, config)
- Không phải client count — bỏ qua hoặc decode hex thủ công

### AP phản hồi khác nhau giữa lần test

- Client count thay đổi là **bình thường** — client kết nối/ngắt kết nối
- Uptime tăng đều là bình thường
- Nếu tbl_size thay đổi → table resize theo số active clients (cần walk, không dùng scalar)

### Scripts cần cập nhật cho model mới

1. Thêm `WALK_TARGETS` trong `test_snmp_walk.js` với enterprise prefix mới
2. Cập nhật `OID` object trong `test_snmp_clients.js` với OID của model mới
3. Điều chỉnh ngưỡng RSSI (`-96` là mặc định cho Altai, model khác có thể khác)
4. Sau khi xác nhận → ghi vào **OID Catalog** trong file này

---

*Cập nhật lần cuối: 2026-05-07 — Altai WA8011NAC-X xác nhận*
