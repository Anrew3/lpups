# network.ps1
# Manages WiFi vs Cellular priority by adjusting interface route metrics.
# Both adapters remain active — only traffic preference changes.
#
# Metrics:
#   WiFi-first:      WiFi=10,  Cellular=50
#   Cellular-first:  WiFi=100, Cellular=5
#
# Usage:
#   .\network.ps1 -Mode status     → outputs "WIFI" or "CELLULAR"
#   .\network.ps1 -Mode wifi       → set WiFi priority
#   .\network.ps1 -Mode cellular   → set Cellular priority

param([string]$Mode = "status")

# ── Adapter discovery ─────────────────────────────────────────────────────────
# WiFi: InterfaceType 71 = IEEE 802.11
$wifi = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 71 -or $_.Name -like "*Wi-Fi*" -or $_.Name -like "*WiFi*" -or $_.Name -like "*Wireless*" } |
    Select-Object -First 1

# Cellular/WWAN: InterfaceType 243 = WirelessWAN
$cell = Get-NetAdapter -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceType -eq 243 -or $_.Name -like "*Cellular*" -or $_.Name -like "*Mobile*" -or $_.Name -like "*WWAN*" -or $_.Name -like "*5G*" -or $_.Name -like "*LTE*" } |
    Select-Object -First 1

if (-not $wifi -and -not $cell) {
    Write-Host "ERROR:NO_ADAPTERS"
    exit 1
}

switch ($Mode.ToLower()) {

    "status" {
        $wMetric = 9999
        $cMetric = 9999

        if ($wifi) {
            $iface = Get-NetIPInterface -InterfaceAlias $wifi.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($iface) { $wMetric = $iface.InterfaceMetric }
        }
        if ($cell) {
            $iface = Get-NetIPInterface -InterfaceAlias $cell.Name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($iface) { $cMetric = $iface.InterfaceMetric }
        }

        if ($cMetric -lt $wMetric) { Write-Host "CELLULAR" }
        else                        { Write-Host "WIFI"     }
    }

    "wifi" {
        if ($wifi) {
            Set-NetIPInterface -InterfaceAlias $wifi.Name -InterfaceMetric 10  -AddressFamily IPv4 -ErrorAction SilentlyContinue
        }
        if ($cell) {
            Set-NetIPInterface -InterfaceAlias $cell.Name -InterfaceMetric 50  -AddressFamily IPv4 -ErrorAction SilentlyContinue
        }
        Write-Host "WIFI"
    }

    "cellular" {
        if ($wifi) {
            Set-NetIPInterface -InterfaceAlias $wifi.Name -InterfaceMetric 100 -AddressFamily IPv4 -ErrorAction SilentlyContinue
        }
        if ($cell) {
            Set-NetIPInterface -InterfaceAlias $cell.Name -InterfaceMetric 5   -AddressFamily IPv4 -ErrorAction SilentlyContinue
        }
        Write-Host "CELLULAR"
    }

    default {
        Write-Host "ERROR:UNKNOWN_MODE"
        exit 1
    }
}
