# OpenSSH Server Auto-Installer for Windows

Quick setup script to install and configure OpenSSH Server on Windows for remote management.

## Files in this folder

- `install_openssh_windows.bat` — **Recommended**: Double-click installer (auto-bypass ExecutionPolicy)
- `install_openssh_windows.ps1` — PowerShell script (can run manually if needed)
- `test_ssh_windows.js` — Node.js test script to verify SSH connection from Mac/Linux

## Quick Start (Recommended)

### On Windows Server:

1. **Copy both files** (`install_openssh_windows.bat` + `install_openssh_windows.ps1`) to Windows
2. **Right-click** `install_openssh_windows.bat` → **Run as Administrator**
3. Wait for completion (~30 seconds)
4. Copy the generated commands shown at the end

### On Mac/Linux (Dev machine):

Use the commands copied from step 4 above, or manually:

```bash
# Test SSH connection
ssh <username>@<IP>

# Test with Node.js script
cd /Users/macbook/Desktop/gasoline_prices
npm install ssh2
node scripts/test_ssh_windows.js <IP> <username> <password>
```

---

## Alternative: Manual PowerShell Execution

If you prefer to run the `.ps1` file directly:

```powershell
# PowerShell as Administrator
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\install_openssh_windows.ps1"
```

---

## What the script does

1. ✅ Installs OpenSSH Server (if not present)
2. ✅ Starts sshd service
3. ✅ Sets service to auto-start on boot
4. ✅ Configures Windows Firewall (opens port 22)
5. ✅ Enables PasswordAuthentication in sshd_config
6. ✅ Displays server IP and username for easy testing

---

## Troubleshooting

**"Script is not digitally signed"**
→ Use the `.bat` wrapper file instead

**"Connection refused"**
→ Check Windows Firewall, ensure port 22 is open

**"Permission denied"**
→ Ensure the username is a member of the **Administrators** group on Windows

**Script shows IP but can't connect from Mac**
→ Check network connectivity: `ping <IP>` from Mac first

---

## Requirements

- Windows Server 2019+ / Windows 10 (build 1809+) / Windows 11
- Administrator privileges
- Network connectivity between Mac and Windows server

---

## After Installation

The script will display:
- Server IP address(es)
- Current username
- Ready-to-use SSH commands for Mac/Linux

Example output:
```
SERVER INFORMATION:
-----------------------------------
Username          : hieu.nt
Computer Name     : SERVER-APP01
IP Addresses      :
                    172.16.10.4

COPY THESE COMMANDS TO USE ON MAC:
-----------------------------------

# Test SSH connection:
ssh hieu.nt@172.16.10.4
```

Simply copy-paste the commands into Mac Terminal!
