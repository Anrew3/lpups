# diagnostics.ps1
# Runs 15 sanity checks against the LattePanda system and writes a human-
# readable report to -OutFile.  Outputs "SUMMARY:pass|warn|fail" on the
# last line of stdout so the plugin can parse the result counts without
# reading the file.
#
# Checks:
#  1  Arduino serial connected    (from plugin state JSON)
#  2  B1 18650 capacity > 20%     (from plugin state JSON)
#  3  B2 12V pack present         (from plugin state JSON)
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

$results = [System.Collections.Generic.List[PSCustomObject]]::new()

function Add-Check {
    param([string]$Name, [string]$Status, [string]$Detail)
    $results.Add([PSCustomObject]@{ Name=$Name; Status=$Status; Detail=$Detail })
}

# ── 1-3  Arduino / battery state (from plugin JSON) ──────────────────────────
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

Add-Check "Arduino Serial"      $(if ($serialOk) {"PASS"} else {"FAIL"}) $(if ($serialOk) {"Connected, data flowing"} else {"No data from serial port"})
Add-Check "B1 UPS Capacity"     $(if ($b1Ok)     {"PASS"} else {"WARN"}) $(if ($b1Ok)     {"Above 20%"}               else {"Below 20% — UPS buffer low"})
Add-Check "B2 12V Pack"         $(if ($b2Ok)     {"PASS"} else {"WARN"}) $(if ($b2Ok)     {"Present"}                 else {"Not detected on VBUS"})

# ── 4  WiFi adapter ──────────────────────────────────────────────────────────
$wifi = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 71 -or $_.Name -like "*Wi-Fi*" -or $_.Name -like "*WiFi*" } |
    Select-Object -First 1
Add-Check "WiFi Adapter"  $(if ($wifi) {"PASS"} else {"FAIL"}) $(if ($wifi) {"$($wifi.Name) — $($wifi.Status)"} else {"No WiFi adapter found"})

# ── 5  Cellular adapter ───────────────────────────────────────────────────────
$cell = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 243 -or $_.Name -like "*Cellular*" -or $_.Name -like "*WWAN*" -or $_.Name -like "*5G*" -or $_.Name -like "*LTE*" -or $_.Name -like "*Mobile*" } |
    Select-Object -First 1
Add-Check "Cellular Adapter" $(if ($cell) {"PASS"} else {"WARN"}) $(if ($cell) {"$($cell.Name) — $($cell.Status)"} else {"No WWAN adapter found"})

# ── 6  Internet ───────────────────────────────────────────────────────────────
$ping = Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction SilentlyContinue
Add-Check "Internet (1.1.1.1)" $(if ($ping) {"PASS"} else {"FAIL"}) $(if ($ping) {"Reachable"} else {"Unreachable — no internet"})

# ── 7  Tailscale service ──────────────────────────────────────────────────────
$tsSvc = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
Add-Check "Tailscale Service" $(if ($tsSvc -and $tsSvc.Status -eq "Running") {"PASS"} else {"FAIL"}) $(if ($tsSvc) {"$($tsSvc.Status)"} else {"Service not installed"})

# ── 8  Tailscale IP ───────────────────────────────────────────────────────────
$tsIP = & tailscale ip -4 2>$null
Add-Check "Tailscale IP" $(if ($tsIP) {"PASS"} else {"WARN"}) $(if ($tsIP) {"$($tsIP.Trim())"} else {"No IP assigned — not connected to mesh"})

# ── 9  RDP registry ───────────────────────────────────────────────────────────
try {
    $rdpReg = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server" -ErrorAction Stop).fDenyTSConnections -eq 0
} catch { $rdpReg = $false }
Add-Check "RDP Registry" $(if ($rdpReg) {"PASS"} else {"FAIL"}) $(if ($rdpReg) {"fDenyTSConnections = 0 (enabled)"} else {"RDP disabled in registry"})

# ── 10  RDP service ───────────────────────────────────────────────────────────
$termSvc = Get-Service -Name "TermService" -ErrorAction SilentlyContinue
Add-Check "RDP Service" $(if ($termSvc -and $termSvc.Status -eq "Running") {"PASS"} else {"FAIL"}) $(if ($termSvc) {"$($termSvc.Status)"} else {"TermService not found"})

# ── 11  RDP firewall rule ─────────────────────────────────────────────────────
$rdpFW = Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "Remote Desktop*" -and $_.Enabled -eq "True" } |
    Select-Object -First 1
Add-Check "RDP Firewall" $(if ($rdpFW) {"PASS"} else {"WARN"}) $(if ($rdpFW) {"Rule enabled: $($rdpFW.DisplayName)"} else {"No active RDP firewall rule found"})

# ── 12  NVMe / SSD health ────────────────────────────────────────────────────
$disk = Get-PhysicalDisk -ErrorAction SilentlyContinue |
    Where-Object { $_.MediaType -in @("SSD","NVMe") } |
    Select-Object -First 1
if (-not $disk) { $disk = Get-PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -First 1 }
$diskOk = $disk -and $disk.HealthStatus -eq "Healthy"
Add-Check "Drive Health" $(if ($diskOk) {"PASS"} elseif ($disk) {"WARN"} else {"FAIL"}) $(if ($disk) {"$($disk.FriendlyName) — $($disk.HealthStatus)"} else {"No physical disk found"})

# ── 13  Free space ────────────────────────────────────────────────────────────
$vol = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
$freeGB = if ($vol) { [math]::Round($vol.SizeRemaining / 1GB, 1) } else { -1 }
$spaceStatus = if ($freeGB -ge 10) {"PASS"} elseif ($freeGB -ge 5) {"WARN"} else {"FAIL"}
Add-Check "Disk Free Space" $spaceStatus $(if ($freeGB -ge 0) {"${freeGB} GB free on C:"} else {"Could not read volume"})

# ── 14  Sleep disabled ────────────────────────────────────────────────────────
$sleepSetting = powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>$null
$sleepDisabled = ($sleepSetting -match "Current AC Power Setting Index: 0x00000000") -or
                 ($sleepSetting -match "Current AC Power Setting Index: 0x0")
Add-Check "Sleep Disabled" $(if ($sleepDisabled) {"PASS"} else {"WARN"}) $(if ($sleepDisabled) {"AC standby = never"} else {"Sleep may be enabled — check powercfg"})

# ── 15  Auto-login ────────────────────────────────────────────────────────────
try {
    $autoLogin = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction Stop).AutoAdminLogon -eq "1"
} catch { $autoLogin = $false }
Add-Check "Auto-Login" $(if ($autoLogin) {"PASS"} else {"WARN"}) $(if ($autoLogin) {"Configured"} else {"Not configured — manual login required after reboot"})

# ── Tally and write report ────────────────────────────────────────────────────
$pass = ($results | Where-Object Status -eq "PASS").Count
$warn = ($results | Where-Object Status -eq "WARN").Count
$fail = ($results | Where-Object Status -eq "FAIL").Count

$ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$header = @"
╔══════════════════════════════════════════════════════════╗
║          LPUPS CASE PANEL — SYSTEM DIAGNOSTICS           ║
║  $ts                                     ║
╠══════════════════════════════════════════════════════════╣
║  RESULT:  $pass PASS   $warn WARN   $fail FAIL                            ║
╚══════════════════════════════════════════════════════════╝

"@

$lines = $results | ForEach-Object {
    $icon = switch ($_.Status) { "PASS" {"✓"} "WARN" {"⚠"} "FAIL" {"✗"} default {"?"} }
    "  [$($_.Status)] $icon  $($_.Name.PadRight(22)) $($_.Detail)"
}

$report = $header + ($lines -join "`n") + "`n`n(Tap the Stream Deck button again to re-run)`n"
$report | Out-File -FilePath $OutFile -Encoding UTF8

# Summary line for the plugin to parse
Write-Host "SUMMARY:${pass}|${warn}|${fail}"
