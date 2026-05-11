# Hướng dẫn cài đặt OpenSSH Server trên Windows

Tài liệu này hướng dẫn enable OpenSSH Server trên Windows Server / Windows 10+
để phục vụ tính năng **Windows Server Monitoring** (kết nối SSH + chạy PowerShell
từ Node.js qua `ssh2`).

> **Áp dụng cho**: Windows Server 2019, 2022, 2025, Windows 10 (build 1809+),
> Windows 11. Các bản cũ hơn cần cài OpenSSH thủ công từ GitHub release
> (https://github.com/PowerShell/Win32-OpenSSH/releases) — không khuyến khích.

---

## Bước 1 — Cài OpenSSH Server (chạy với quyền Administrator)

Mở **PowerShell as Administrator** trên Windows server, chạy:

```powershell
# Kiểm tra trạng thái hiện tại của OpenSSH (đã cài chưa?)
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH*'

# Nếu OpenSSH.Server~~~~0.0.1.0 đang ở State NotPresent thì cài:
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
```

Kết quả mong đợi:
```
Path          :
Online        : True
RestartNeeded : False
```

---

## Bước 2 — Khởi động service và đặt tự động chạy khi boot

```powershell
# Khởi động service
Start-Service sshd

# Đặt tự động khởi động khi server reboot
Set-Service -Name sshd -StartupType 'Automatic'

# Xác minh
Get-Service sshd
```

Output mong đợi: `Status = Running`, `StartType = Automatic`.

---

## Bước 3 — Mở firewall Windows cho port 22

Khi cài qua `Add-WindowsCapability`, rule firewall thường được tạo sẵn tên
`OpenSSH-Server-In-TCP`. Kiểm tra:

```powershell
Get-NetFirewallRule -Name *ssh*
```

Nếu chưa có hoặc đang Disabled:

```powershell
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server (sshd)' `
  -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

---

## Bước 4 — Cấu hình authentication

File config: `C:\ProgramData\ssh\sshd_config`.

Mở bằng Notepad as Administrator:

```powershell
notepad C:\ProgramData\ssh\sshd_config
```

Đảm bảo các dòng sau (uncomment nếu bị comment bằng `#`):

```
PasswordAuthentication yes      # vì plan dùng password (đã chốt với user)
PubkeyAuthentication yes        # tùy chọn, để dùng SSH key sau này
PermitRootLogin no              # Windows không có root, để no
```

Sau khi sửa, restart service:

```powershell
Restart-Service sshd
```

---

## Bước 5 — Test login từ máy phát triển (Mac/Linux)

Từ máy Mac/Linux nơi Node.js app chạy, mở terminal:

```bash
ssh <username>@<windows-host>
# Ví dụ:
ssh Administrator@10.10.5.21
```

Lần đầu sẽ hỏi accept fingerprint → gõ `yes` → nhập password → vào được command
prompt Windows.

Khi thấy prompt `C:\Users\Administrator>` là OK.

> ⚠️ **Username trên Windows**:
> - Với **local account**: dùng tên tài khoản local (vd `Administrator`).
> - Với **Microsoft account**: dùng tên 5 ký tự đầu của email (xem `whoami` để
>   chắc chắn). Không dùng email đầy đủ.
> - Với **domain account**: `domain\\username` hoặc `username@domain`.

---

## Bước 6 — Test PowerShell qua SSH

```bash
ssh Administrator@10.10.5.21 "powershell -Command \"Get-Date\""
```

Phải in ra ngày giờ hiện tại trên Windows server.

Nếu OK, default shell của OpenSSH đang là `cmd.exe`. Để mặc định là PowerShell
(không bắt buộc, vì script Node sẽ gọi `powershell -Command` thẳng):

```powershell
# Trên Windows, chạy as admin:
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -PropertyType String -Force
```

---

## Bước 7 — Test bằng Node.js script

Trên máy phát triển (Mac/Linux có Node), trong repo:

```bash
npm install ssh2          # nếu chưa cài
node scripts/test_ssh_windows.js 10.10.5.21 Administrator "P@ssw0rd"
```

Output mong đợi (rút gọn):

```
[OK] SSH handshake thành công với 10.10.5.21:22
[OK] PowerShell thực thi xong (1234ms). Raw output:
{"hostname":"SRV-APP01","os":"Microsoft Windows Server 2022 Standard",...}

[RESULT] Parsed metrics:
  Hostname    : SRV-APP01
  OS          : Microsoft Windows Server 2022 Standard
  Uptime      : 86400 giây (~24h)
  CPU load    : 12%
  RAM used    : 47.3%
  Disks       :
    - C: 62.3/120.0 GB (52% used, 57.7 GB free)

[DONE] ✅ Môi trường đã sẵn sàng. Có thể triển khai feature theo plan.
```

Nếu thấy dòng `[DONE] ✅`, môi trường OK và có thể bắt đầu thực thi
**WINDOWS_MONITORING_EXECUTION_PLAN.md**.

---

## Troubleshooting nhanh

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|-------------|------------------------|------------|
| `Connection refused` | sshd chưa chạy | `Start-Service sshd` |
| `Connection timed out` | Firewall chặn port 22 | Xem Bước 3 |
| `Permission denied (password)` | Sai username/password, hoặc Microsoft account format | Dùng local account; thử `ssh user@host` thủ công trước |
| `Get-CimInstance` báo Access Denied | Tài khoản không phải admin | Dùng tài khoản trong group Administrators |
| Script chạy được nhưng `cpu` = null | `LoadPercentage` chưa kịp tính | Đợi 1–2 giây sau boot, hoặc check lại lần 2 |
| `Restart-Computer` báo "denied" | Cần `-Force` + tài khoản admin có quyền `SeShutdownPrivilege` | Plan đã dùng `-Force`; xác nhận user thuộc local Administrators |

---

## Checklist sẵn sàng triển khai

Trước khi bắt đầu thực thi plan, mỗi Windows server cần monitor phải pass hết:

- [ ] `Get-Service sshd` → Status: Running, StartType: Automatic
- [ ] `Get-NetFirewallRule -Name *ssh*` → Enabled: True
- [ ] SSH thủ công từ máy dev được (Bước 5)
- [ ] PowerShell qua SSH chạy được (Bước 6)
- [ ] `node scripts/test_ssh_windows.js ...` in ra `[DONE] ✅` (Bước 7)
- [ ] Tài khoản dùng để monitor: thuộc group **Administrators** trên Windows
- [ ] Ghi lại: host, port (default 22), username, password để đưa vào DB sau này
