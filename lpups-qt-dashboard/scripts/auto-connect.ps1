# auto-connect.ps1
# Automatically connects to the best available network:
#   1. Scan for known WiFi networks nearby
#   2. Connect to the strongest known network
#   3. Fall back to cellular if no WiFi available
#   4. Verify internet connectivity
#
# Output format (machine-readable):
#   RESULT:WIFI_CONNECTED:<SSID>
#   RESULT:WIFI_ALREADY:<SSID>
#   RESULT:CELLULAR_FALLBACK
#   RESULT:CELLULAR_ALREADY
#   RESULT:NO_CONNECTIVITY
#   RESULT:ERROR:<message>
#
# Usage:
#   .\auto-connect.ps1                # auto-connect to best available
#   .\auto-connect.ps1 -Mode scan     # just scan, don't connect
#   .\auto-connect.ps1 -Mode force    # disconnect and reconnect fresh

param(
    [string]$Mode = "auto"
)

$ErrorActionPreference = "SilentlyContinue"

# ── Helper: Test internet connectivity ──────────────────────────────────
function Test-Internet {
    try {
        $result = Test-NetConnection -ComputerName "8.8.8.8" -Port 53 -InformationLevel Quiet -WarningAction SilentlyContinue
        return $result
    } catch {
        # Fallback: try a simple ping
        try {
            $ping = Test-Connection -ComputerName "8.8.8.8" -Count 1 -Quiet -TimeoutSeconds 3
            return $ping
        } catch {
            return $false
        }
    }
}

# ── Helper: Get WiFi adapter ───────────────────────────────────────────
function Get-WiFiAdapter {
    Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object {
            $_.InterfaceType -eq 71 -or
            $_.Name -like "*Wi-Fi*" -or
            $_.Name -like "*WiFi*" -or
            $_.Name -like "*Wireless*"
        } |
        Where-Object { $_.Status -ne "Disabled" } |
        Select-Object -First 1
}

# ── Helper: Get Cellular adapter ───────────────────────────────────────
function Get-CellAdapter {
    Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object {
            $_.InterfaceType -eq 243 -or
            $_.Name -like "*Cellular*" -or
            $_.Name -like "*Mobile*" -or
            $_.Name -like "*WWAN*" -or
            $_.Name -like "*5G*" -or
            $_.Name -like "*LTE*" -or
            $_.Name -like "*Quectel*"
        } |
        Where-Object { $_.Status -ne "Disabled" } |
        Select-Object -First 1
}

# ── Scan for available WiFi networks ───────────────────────────────────
function Get-AvailableNetworks {
    try {
        $raw = netsh wlan show networks mode=bssid 2>&1
        $networks = @()
        $current  = $null

        foreach ($line in $raw) {
            if ($line -match "^SSID \d+ : (.+)$") {
                if ($current -and $current.SSID) { $networks += $current }
                $current = @{ SSID = $Matches[1].Trim(); Signal = 0; Auth = "" }
            }
            elseif ($line -match "Signal\s*:\s*(\d+)%") {
                if ($current) { $current.Signal = [int]$Matches[1] }
            }
            elseif ($line -match "Authentication\s*:\s*(.+)") {
                if ($current) { $current.Auth = $Matches[1].Trim() }
            }
        }
        if ($current -and $current.SSID) { $networks += $current }

        return $networks | Sort-Object { $_.Signal } -Descending
    } catch {
        return @()
    }
}

# ── Get saved/known WiFi profiles ─────────────────────────────────────
function Get-KnownProfiles {
    try {
        $raw = netsh wlan show profiles 2>&1
        $profiles = @()
        foreach ($line in $raw) {
            if ($line -match "All User Profile\s*:\s*(.+)$") {
                $profiles += $Matches[1].Trim()
            }
        }
        return $profiles
    } catch {
        return @()
    }
}

# ── Get currently connected WiFi ──────────────────────────────────────
function Get-CurrentWiFi {
    try {
        $raw = netsh wlan show interfaces 2>&1
        foreach ($line in $raw) {
            if ($line -match "^\s*SSID\s*:\s*(.+)$") {
                return $Matches[1].Trim()
            }
        }
        return $null
    } catch {
        return $null
    }
}

# ── Connect to a WiFi network ─────────────────────────────────────────
function Connect-WiFi([string]$SSID) {
    try {
        Write-Host "INFO:Connecting to WiFi: $SSID"
        $result = netsh wlan connect name="$SSID" 2>&1
        if ($result -match "successfully") {
            # Wait for connection to establish
            Start-Sleep -Seconds 3
            $connected = Get-CurrentWiFi
            if ($connected -eq $SSID) {
                return $true
            }
            # Give it a bit more time
            Start-Sleep -Seconds 3
            $connected = Get-CurrentWiFi
            return ($connected -eq $SSID)
        }
        return $false
    } catch {
        return $false
    }
}

# ── Set WiFi as priority ──────────────────────────────────────────────
function Set-WiFiPriority {
    $wifi = Get-WiFiAdapter
    $cell = Get-CellAdapter
    if ($wifi) {
        Set-NetIPInterface -InterfaceAlias $wifi.Name -InterfaceMetric 10 -AddressFamily IPv4 -ErrorAction SilentlyContinue
    }
    if ($cell) {
        Set-NetIPInterface -InterfaceAlias $cell.Name -InterfaceMetric 50 -AddressFamily IPv4 -ErrorAction SilentlyContinue
    }
}

# ── Set Cellular as priority ─────────────────────────────────────────
function Set-CellularPriority {
    $wifi = Get-WiFiAdapter
    $cell = Get-CellAdapter
    if ($wifi) {
        Set-NetIPInterface -InterfaceAlias $wifi.Name -InterfaceMetric 100 -AddressFamily IPv4 -ErrorAction SilentlyContinue
    }
    if ($cell) {
        Set-NetIPInterface -InterfaceAlias $cell.Name -InterfaceMetric 5 -AddressFamily IPv4 -ErrorAction SilentlyContinue
    }
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════

$wifi = Get-WiFiAdapter
$cell = Get-CellAdapter

Write-Host "INFO:WiFi adapter: $(if ($wifi) { $wifi.Name + ' (' + $wifi.Status + ')' } else { 'not found' })"
Write-Host "INFO:Cell adapter: $(if ($cell) { $cell.Name + ' (' + $cell.Status + ')' } else { 'not found' })"

# ── Scan only mode ────────────────────────────────────────────────────
if ($Mode -eq "scan") {
    $available = Get-AvailableNetworks
    $known     = Get-KnownProfiles
    $current   = Get-CurrentWiFi

    Write-Host "INFO:Current WiFi: $(if ($current) { $current } else { 'none' })"
    Write-Host "INFO:Known profiles: $($known.Count)"
    Write-Host "INFO:Available networks: $($available.Count)"

    foreach ($net in $available) {
        $isKnown = $known -contains $net.SSID
        $marker  = if ($isKnown) { "[KNOWN]" } else { "" }
        Write-Host "SCAN:$($net.Signal)%|$($net.SSID)|$($net.Auth)|$marker"
    }

    Write-Host "RESULT:SCAN_COMPLETE"
    exit 0
}

# ── Force mode: disconnect first ──────────────────────────────────────
if ($Mode -eq "force") {
    Write-Host "INFO:Force mode - disconnecting current WiFi..."
    netsh wlan disconnect 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# ── Auto-connect logic ───────────────────────────────────────────────

# Step 1: Check if already connected to WiFi with internet
$currentSSID = Get-CurrentWiFi
if ($currentSSID -and $Mode -ne "force") {
    Write-Host "INFO:Already connected to WiFi: $currentSSID"
    $hasInternet = Test-Internet
    if ($hasInternet) {
        Set-WiFiPriority
        Write-Host "RESULT:WIFI_ALREADY:$currentSSID"
        exit 0
    }
    Write-Host "INFO:Connected to $currentSSID but no internet - trying other networks..."
    netsh wlan disconnect 2>&1 | Out-Null
    Start-Sleep -Seconds 2
}

# Step 2: Scan for known WiFi networks
Write-Host "INFO:Scanning for WiFi networks..."
$available = Get-AvailableNetworks
$known     = Get-KnownProfiles

Write-Host "INFO:Found $($available.Count) networks, $($known.Count) known profiles"

# Find known networks that are available, sorted by signal strength
$candidates = $available | Where-Object { $known -contains $_.SSID }

if ($candidates.Count -gt 0) {
    Write-Host "INFO:Found $($candidates.Count) known network(s) nearby"

    foreach ($net in $candidates) {
        Write-Host "INFO:Trying $($net.SSID) (signal: $($net.Signal)%)..."
        $ok = Connect-WiFi $net.SSID
        if ($ok) {
            # Verify internet
            $hasInternet = Test-Internet
            if ($hasInternet) {
                Set-WiFiPriority
                Write-Host "RESULT:WIFI_CONNECTED:$($net.SSID)"
                exit 0
            }
            Write-Host "INFO:Connected to $($net.SSID) but no internet, trying next..."
            netsh wlan disconnect 2>&1 | Out-Null
            Start-Sleep -Seconds 1
        } else {
            Write-Host "INFO:Failed to connect to $($net.SSID)"
        }
    }
    Write-Host "INFO:No known WiFi networks provided internet access"
}
else {
    Write-Host "INFO:No known WiFi networks in range"
}

# Step 3: Fall back to cellular
if ($cell) {
    Write-Host "INFO:Falling back to cellular..."

    # Enable cellular adapter if it's not up
    if ($cell.Status -ne "Up") {
        Write-Host "INFO:Enabling cellular adapter..."
        Enable-NetAdapter -Name $cell.Name -Confirm:$false -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        $cell = Get-CellAdapter
    }

    if ($cell -and $cell.Status -eq "Up") {
        Set-CellularPriority
        Start-Sleep -Seconds 3
        $hasInternet = Test-Internet
        if ($hasInternet) {
            Write-Host "RESULT:CELLULAR_FALLBACK"
            exit 0
        }
        Write-Host "INFO:Cellular adapter is up but no internet"
    } else {
        Write-Host "INFO:Cellular adapter not available or not connected"
    }
}

# Step 4: No connectivity
Write-Host "RESULT:NO_CONNECTIVITY"
exit 1
