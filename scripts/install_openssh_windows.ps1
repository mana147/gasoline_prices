# =============================================================================
# Auto-install OpenSSH Server on Windows
# Requires: PowerShell run as Administrator
# Version: 1.1 - 2026-05-11
# =============================================================================
# 
# RECOMMENDED METHOD (EASIEST):
# -----------------------------------------------------------------------------
# Use the .bat wrapper file (no need to set ExecutionPolicy manually):
# 1. Copy both install_openssh_windows.bat and install_openssh_windows.ps1 
#    to Windows (same folder)
# 2. Right-click install_openssh_windows.bat -> "Run as Administrator"
# 3. Done!
# 
# =============================================================================
# 
# ALTERNATIVE METHOD (Manual PowerShell):
# -----------------------------------------------------------------------------
# If you only have the .ps1 file:
# 1. Open PowerShell as Administrator
# 2. Run: Set-ExecutionPolicy Bypass -Scope Process -Force
# 3. Run: cd C:\path\to\script
# 4. Run: .\install_openssh_windows.ps1
# 
# OR one-liner:
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\to\install_openssh_windows.ps1"
# 
# =============================================================================


# Check Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Script must run with Administrator privileges!" -ForegroundColor Red
    Write-Host "How to: Right-click PowerShell -> 'Run as Administrator' -> run script again" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AUTO-INSTALL OPENSSH SERVER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ===========================================
# STEP 1: Check and install OpenSSH Server
# ===========================================
Write-Host "[Step 1/5] Checking OpenSSH Server..." -ForegroundColor Yellow

$sshServer = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'

if ($sshServer.State -eq "Installed") {
    Write-Host "[OK] OpenSSH Server is already installed" -ForegroundColor Green
} elseif ($sshServer.State -eq "NotPresent") {
    Write-Host "-> Installing OpenSSH Server (may take 30-60 seconds)..." -ForegroundColor Cyan
    
    try {
        Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 -ErrorAction Stop | Out-Null
        Write-Host "[OK] OpenSSH Server installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Failed to install OpenSSH Server" -ForegroundColor Red
        Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[WARN] OpenSSH Server state: $($sshServer.State)" -ForegroundColor Yellow
}

Write-Host ""

# ===========================================
# STEP 2: Start sshd service
# ===========================================
Write-Host "[Step 2/5] Starting sshd service..." -ForegroundColor Yellow

try {
    $service = Get-Service sshd -ErrorAction Stop
    
    if ($service.Status -eq "Running") {
        Write-Host "[OK] Service sshd is already running" -ForegroundColor Green
    } else {
        Write-Host "-> Starting service sshd..." -ForegroundColor Cyan
        Start-Service sshd -ErrorAction Stop
        Start-Sleep -Seconds 2
        Write-Host "[OK] Service sshd started" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] Failed to start sshd service" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ===========================================
# STEP 3: Set service to auto-start on boot
# ===========================================
Write-Host "[Step 3/5] Setting service to auto-start..." -ForegroundColor Yellow

try {
    Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction Stop
    $startupType = (Get-Service sshd).StartType
    Write-Host "[OK] Startup Type: $startupType" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to set Startup Type" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ===========================================
# STEP 4: Configure Windows Firewall
# ===========================================
Write-Host "[Step 4/5] Configuring Windows Firewall..." -ForegroundColor Yellow

$firewallRule = Get-NetFirewallRule -Name "*OpenSSH-Server*" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq $true }

if ($firewallRule) {
    Write-Host "[OK] Firewall rule for SSH already exists and enabled" -ForegroundColor Green
} else {
    Write-Host "-> Creating firewall rule for port 22..." -ForegroundColor Cyan
    
    try {
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' `
                            -DisplayName 'OpenSSH SSH Server (sshd)' `
                            -Enabled True `
                            -Direction Inbound `
                            -Protocol TCP `
                            -Action Allow `
                            -LocalPort 22 `
                            -ErrorAction Stop | Out-Null
        Write-Host "[OK] Firewall rule created" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Cannot create firewall rule (may already exist)" -ForegroundColor Yellow
        Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

Write-Host ""

# ===========================================
# STEP 5: Configure sshd_config
# ===========================================
Write-Host "[Step 5/5] Configuring authentication..." -ForegroundColor Yellow

$sshdConfigPath = "C:\ProgramData\ssh\sshd_config"

if (-not (Test-Path $sshdConfigPath)) {
    Write-Host "[ERROR] File not found: $sshdConfigPath" -ForegroundColor Red
    exit 1
}

try {
    # Read file content
    $content = Get-Content $sshdConfigPath -Raw
    $modified = $false
    
    # Uncomment PasswordAuthentication yes
    if ($content -match '#\s*PasswordAuthentication\s+yes') {
        $content = $content -replace '#\s*PasswordAuthentication\s+yes', 'PasswordAuthentication yes'
        $modified = $true
        Write-Host "[OK] Enabled PasswordAuthentication" -ForegroundColor Green
    } elseif ($content -match 'PasswordAuthentication\s+yes') {
        Write-Host "[OK] PasswordAuthentication already enabled" -ForegroundColor Green
    } else {
        # Add new line if not exists
        $content += "`nPasswordAuthentication yes`n"
        $modified = $true
        Write-Host "[OK] Added PasswordAuthentication yes" -ForegroundColor Green
    }
    
    # Uncomment PubkeyAuthentication yes
    if ($content -match '#\s*PubkeyAuthentication\s+yes') {
        $content = $content -replace '#\s*PubkeyAuthentication\s+yes', 'PubkeyAuthentication yes'
        $modified = $true
        Write-Host "[OK] Enabled PubkeyAuthentication" -ForegroundColor Green
    } elseif ($content -match 'PubkeyAuthentication\s+yes') {
        Write-Host "[OK] PubkeyAuthentication already enabled" -ForegroundColor Green
    } else {
        # Add new line if not exists
        $content += "`nPubkeyAuthentication yes`n"
        $modified = $true
        Write-Host "[OK] Added PubkeyAuthentication yes" -ForegroundColor Green
    }
    
    # Write back to file if modified
    if ($modified) {
        $content | Set-Content $sshdConfigPath -NoNewline -ErrorAction Stop
        Write-Host "[OK] File sshd_config updated" -ForegroundColor Green
        
        # Restart service to apply changes
        Write-Host "-> Restarting sshd service to apply config..." -ForegroundColor Cyan
        Restart-Service sshd -ErrorAction Stop
        Start-Sleep -Seconds 2
        Write-Host "[OK] Service sshd restarted" -ForegroundColor Green
    }
    
} catch {
    Write-Host "[ERROR] Failed to configure sshd_config" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# ===========================================
# FINAL VERIFICATION
# ===========================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION VERIFICATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$service = Get-Service sshd
Write-Host "Service Status    : $($service.Status)" -ForegroundColor $(if ($service.Status -eq "Running") {"Green"} else {"Red"})
Write-Host "Startup Type      : $($service.StartType)" -ForegroundColor $(if ($service.StartType -eq "Automatic") {"Green"} else {"Yellow"})

$firewallCheck = Get-NetFirewallRule -Name "*OpenSSH-Server*" -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq $true }
Write-Host "Firewall Rule     : $(if ($firewallCheck) {'Enabled (OK)'} else {'Not Found'})" -ForegroundColor $(if ($firewallCheck) {"Green"} else {"Red"})

Write-Host ""

if ($service.Status -eq "Running" -and $service.StartType -eq "Automatic") {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  INSTALLATION COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # Get server information
    Write-Host "SERVER INFORMATION:" -ForegroundColor Cyan
    Write-Host "-----------------------------------" -ForegroundColor Cyan
    
    # Get current username
    $currentUser = $env:USERNAME
    Write-Host "Username          : $currentUser" -ForegroundColor White
    
    # Get computer name
    $computerName = $env:COMPUTERNAME
    Write-Host "Computer Name     : $computerName" -ForegroundColor White
    
    # Get IP addresses (filter out loopback and link-local)
    Write-Host "IP Addresses      :" -ForegroundColor White
    $ipAddresses = Get-NetIPAddress -AddressFamily IPv4 | 
                   Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
                   Select-Object -ExpandProperty IPAddress
    
    if ($ipAddresses) {
        foreach ($ip in $ipAddresses) {
            Write-Host "                    $ip" -ForegroundColor Yellow
        }
    } else {
        Write-Host "                    No IP found" -ForegroundColor Red
    }
    
    Write-Host ""
    
    # Generate example commands
    if ($ipAddresses -and $ipAddresses.Count -gt 0) {
        $primaryIP = $ipAddresses[0]
        
        Write-Host "COPY THESE COMMANDS TO USE ON MAC:" -ForegroundColor Cyan
        Write-Host "-----------------------------------" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "# Test SSH connection:" -ForegroundColor Gray
        Write-Host "ssh $currentUser@$primaryIP" -ForegroundColor Green
        Write-Host ""
        Write-Host "# Test PowerShell over SSH:" -ForegroundColor Gray
        Write-Host "ssh $currentUser@$primaryIP `"powershell -Command Get-Date`"" -ForegroundColor Green
        Write-Host ""
        Write-Host "# Test with Node.js script:" -ForegroundColor Gray
        Write-Host "cd /Users/macbook/Desktop/gasoline_prices" -ForegroundColor Green
        Write-Host "npm install ssh2" -ForegroundColor Green
        Write-Host "node scripts/test_ssh_windows.js $primaryIP $currentUser `"<YOUR_PASSWORD>`"" -ForegroundColor Green
        Write-Host ""
    }
    
    Write-Host "NOTE: Username must be member of Administrators group" -ForegroundColor Yellow
    Write-Host "      Password is your Windows login password" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  INSTALLATION INCOMPLETE" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Please review the steps above" -ForegroundColor Yellow
    exit 1
}
