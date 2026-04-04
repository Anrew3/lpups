# diagnostics-stream.ps1
# Streaming version of the diagnostics check.
# Emits one line per check as it completes:
#   CHECK:PASS|WARN|FAIL:CheckName:Detail
#
# Checks (same 15 as the Stream Deck version):
#  1  Arduino serial connected
#  2  B1 18650 capacity > 20%
#  3  B2 12V pack present
#  4  WiFi adapter exists
#  5  Cellular/WWAN adapter exists
#  6  Internet reachable (1.1.1.1)
#  7  Tailscale service running
#  8  Tailscale has an IP assigned
#  9  RDP enabled in registry
# 10  RDP service (TermService) running
# 11  RDP firewall rule active
# 12  NVMe/SSD health = Healthy
# 13  C: drive free space >= 5 GB
# 14  Hibernate / sleep disabled
# 15  Windows auto-login configured

param(
    [string]$StateFile = "",
    [string]$OutFile   = "$env:TEMP\lpups-diagnostics.txt"
)

function Emit {
    param([string]$Status, [string]$Name, [string]$Detail)
    Write-Host "CHECK:${Status}:${Name}:${Detail}"
    [Console]::Out.Flush()
}

# ── 1-3  Arduino / battery state ─────────────────────────────────────────────
$serialOk = $false
$b1Ok     = $false
$b2Ok     = $false

if ($StateFile -and (Test-Path $StateFile)) {
    try {
        $state    = Get-Content $StateFile -Raw | ConvertFrom-Json
        $serialOk = [bool]$state.connected
        $b1Ok     = [int]$state.b1Capacity -gt 20
        $b2Ok     = [bool]$state.b2Present
    } catch { }
}

Emit $(if ($serialOk) {"PASS"} else {"FAIL"}) "Arduino Serial"  $(if ($serialOk) {"Connected"} else {"No data from serial port"})
Emit $(if ($b1Ok)     {"PASS"} else {"WARN"}) "B1 UPS Capacity" $(if ($b1Ok)     {"Above 20%"}  else {"Below 20% — UPS buffer low"})
Emit $(if ($b2Ok)     {"PASS"} else {"WARN"}) "B2 12V Pack"     $(if ($b2Ok)     {"Present"}    else {"Not detected on VBUS"})

# ── 4  WiFi adapter ──────────────────────────────────────────────────────────
$wifi = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 71 -or $_.Name -like "*Wi-Fi*" -or $_.Name -like "*WiFi*" } |
    Select-Object -First 1
Emit $(if ($wifi) {"PASS"} else {"FAIL"}) "WiFi Adapter" $(if ($wifi) {"$($wifi.Name) — $($wifi.Status)"} else {"No WiFi adapter found"})

# ── 5  Cellular adapter ───────────────────────────────────────────────────────
$cell = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 243 -or $_.Name -like "*Cellular*" -or $_.Name -like "*WWAN*" -or $_.Name -like "*5G*" -or $_.Name -like "*LTE*" -or $_.Name -like "*Mobile*" } |
    Select-Object -First 1
Emit $(if ($cell) {"PASS"} else {"WARN"}) "Cellular Adapter" $(if ($cell) {"$($cell.Name) — $($cell.Status)"} else {"No WWAN adapter found"})

# ── 6  Internet ───────────────────────────────────────────────────────────────
$ping = Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction SilentlyContinue
Emit $(if ($ping) {"PASS"} else {"FAIL"}) "Internet (1.1.1.1)" $(if ($ping) {"Reachable"} else {"Unreachable"})

# ── 7  Tailscale service ──────────────────────────────────────────────────────
$tsSvc = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
Emit $(if ($tsSvc -and $tsSvc.Status -eq "Running") {"PASS"} else {"FAIL"}) "Tailscale Service" $(if ($tsSvc) {"$($tsSvc.Status)"} else {"Service not installed"})

# ── 8  Tailscale IP ───────────────────────────────────────────────────────────
$tsIP = & tailscale ip -4 2>$null
Emit $(if ($tsIP) {"PASS"} else {"WARN"}) "Tailscale IP" $(if ($tsIP) {"$($tsIP.Trim())"} else {"No IP assigned"})

# ── 9  RDP registry ───────────────────────────────────────────────────────────
try {
    $rdpReg = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" -ErrorAction Stop).fDenyTSConnections -eq 0
} catch { $rdpReg = $false }
Emit $(if ($rdpReg) {"PASS"} else {"FAIL"}) "RDP Registry" $(if ($rdpReg) {"fDenyTSConnections = 0 (enabled)"} else {"RDP disabled in registry"})

# ── 10  RDP service ───────────────────────────────────────────────────────────
$termSvc = Get-Service -Name "TermService" -ErrorAction SilentlyContinue
Emit $(if ($termSvc -and $termSvc.Status -eq "Running") {"PASS"} else {"FAIL"}) "RDP Service" $(if ($termSvc) {"$($termSvc.Status)"} else {"TermService not found"})

# ── 11  RDP firewall rule ─────────────────────────────────────────────────────
$rdpFW = Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "Remote Desktop*" -and $_.Enabled -eq "True" } |
    Select-Object -First 1
Emit $(if ($rdpFW) {"PASS"} else {"WARN"}) "RDP Firewall" $(if ($rdpFW) {"Rule enabled: $($rdpFW.DisplayName)"} else {"No active RDP firewall rule"})

# ── 12  NVMe / SSD health ────────────────────────────────────────────────────
$disk = Get-PhysicalDisk -ErrorAction SilentlyContinue |
    Where-Object { $_.MediaType -in @("SSD","NVMe") } |
    Select-Object -First 1
if (-not $disk) { $disk = Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -First 1 }
$diskOk = $disk -and $disk.HealthStatus -eq "Healthy"
Emit $(if ($diskOk) {"PASS"} elseif ($disk) {"WARN"} else {"FAIL"}) "Drive Health" $(if ($disk) {"$($disk.FriendlyName) — $($disk.HealthStatus)"} else {"No physical disk found"})

# ── 13  Free space ────────────────────────────────────────────────────────────
$vol    = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
$freeGB = if ($vol) { [math]::Round($vol.SizeRemaining / 1GB, 1) } else { -1 }
$spSt   = if ($freeGB -ge 10) {"PASS"} elseif ($freeGB -ge 5) {"WARN"} else {"FAIL"}
Emit $spSt "Disk Free Space" $(if ($freeGB -ge 0) {"${freeGB} GB free on C:"} else {"Could not read volume"})

# ── 14  Sleep disabled ────────────────────────────────────────────────────────
$sleepSetting  = powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null
$sleepDisabled = ($sleepSetting -match "Current AC Power Setting Index: 0x00000000") -or
                 ($sleepSetting -match "Current AC Power Setting Index: 0x0")
Emit $(if ($sleepDisabled) {"PASS"} else {"WARN"}) "Sleep Disabled" $(if ($sleepDisabled) {"AC standby = never"} else {"Sleep may be enabled"})

# ── 15  Auto-login ────────────────────────────────────────────────────────────
try {
    $autoLogin = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction Stop).AutoAdminLogon -eq "1"
} catch { $autoLogin = $false }
Emit $(if ($autoLogin) {"PASS"} else {"WARN"}) "Auto-Login" $(if ($autoLogin) {"Configured"} else {"Not configured — manual login required after reboot"})
