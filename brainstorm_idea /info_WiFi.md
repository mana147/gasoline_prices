# Network Recon — WiFi AP Infrastructure

## Thông tin máy thực hiện quét

| Thuộc tính | Giá trị |
|---|---|
| OS | macOS 12.7.6 Monterey (Darwin 21.6.0) |
| Tool | Nmap 7.93 |
| Interface 1 | `172.16.65.32/20` — subnet `172.16.64.0 – 172.16.79.255` |
| Interface 2 | `172.16.2.7/20` — subnet `172.16.0.0 – 172.16.15.255` |

---

## Mục tiêu quét

- **Dải IP:** `172.16.82.2 – 172.16.82.10`
- **Loại thiết bị:** Access Point (AP) phát sóng WiFi
- **Vai trò người dùng:** Quản trị hạ tầng WiFi

---

## Kết quả quét Nmap (`nmap -sn`)

**Thời gian quét:** 2026-05-07 10:53 +07  
**Tổng IP quét:** 9 | **Host up:** 7 | **Host down/không phản hồi:** 2 (`.6`, `.9`)

| IP | Trạng thái | MAC |
|---|---|---|
| 172.16.82.2 | UP (0.00035s) | Chưa lấy được |
| 172.16.82.3 | UP (0.00042s) | Chưa lấy được |
| 172.16.82.4 | UP (0.00041s) | Chưa lấy được |
| 172.16.82.5 | UP (0.00043s) | Chưa lấy được |
| 172.16.82.6 | DOWN | — |
| 172.16.82.7 | UP (0.00036s) | Chưa lấy được |
| 172.16.82.8 | UP (0.00036s) | Chưa lấy được |
| 172.16.82.9 | DOWN | — |
| 172.16.82.10 | UP (0.00036s) | Chưa lấy được |

---

## Nguyên nhân không lấy được MAC

Máy quét (`172.16.65.32/20`) và dải mục tiêu (`172.16.82.x`) **khác subnet L2**.  
ARP — cơ chế nmap dùng để lấy MAC — chỉ hoạt động trong cùng một broadcast domain (L2 segment).  
Các host 172.16.82.x được định tuyến qua gateway, không phải kết nối trực tiếp → **MAC không truyền qua router**.

---

## Phương án lấy MAC (theo độ ưu tiên)

### 1. ARP table trên Router/L3 Switch (dễ nhất, chắc chắn nhất)
Thiết bị định tuyến giữa hai subnet luôn có ARP table của 172.16.82.x.
```bash
# Cisco IOS
show arp | include 172.16.82

# MikroTik RouterOS
/ip arp print where address~"172.16.82"

# Linux router
arp -n | grep "172.16.82"
```

### 2. SNMP Walk (hoạt động qua L3, không cần cùng subnet)
```bash
snmpwalk -v2c -c public 172.16.82.2 1.3.6.1.2.1.2.2.1.6
```

### 3. SSH trực tiếp vào AP
```bash
ssh admin@172.16.82.2
# Trong AP:
ip link show     # Linux-based
ifconfig         # Older firmware
```

### 4. DHCP Server leases
```bash
cat /var/lib/dhcp/dhcpd.leases | grep -A 5 "172.16.82"
cat /var/lib/misc/dnsmasq.leases | grep "172.16.82"
```

### 5. Controller tập trung
Nếu AP thuộc hệ sinh thái có controller (UniFi, Omada, Aruba, Cisco WLC...) thì toàn bộ IP + MAC + tên AP đã có sẵn trong giao diện quản lý.

---

## Thông tin còn thiếu (cần xác nhận)

- [ ] Hãng AP: Ubiquiti / TP-Link / Cisco / MikroTik / Ruijie / khác?
- [ ] IP gateway của subnet 172.16.82.x là bao nhiêu?
- [ ] Có thể SSH vào AP không? Credential?
- [ ] Có controller tập trung (UniFi Controller, Omada...) không?
- [ ] SNMP community string là gì? (mặc định thường là `public`)
