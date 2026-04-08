#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time setup for the LPUPS system (Stream Deck plugin + Qt Dashboard).
  Run this once after cloning the repo on the LattePanda.

  What it does:
    1. Cleans up old Electron dashboard files if present
    2. Installs & builds the Stream Deck plugin
    3. Creates Stream Deck plugin junction link
    4. Installs Qt Dashboard Python dependencies
    5. Creates Qt Dashboard startup shortcut

  Usage (Admin PowerShell from repo root):
    .\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pluginId       = "com.lpups.casepanel.sdPlugin"
$pluginSrc      = Join-Path $PSScriptRoot "streamdeck\$pluginId"
$qtDashboard    = Join-Path $PSScriptRoot "lpups-qt-dashboard"
$sdPlugins      = "$env:APPDATA\Elgato\StreamDeck\Plugins"
$junctionTarget = Join-Path $sdPlugins $pluginId

Write-Host ""
Write-Host "=== LPUPS System - First-Time Setup ===" -ForegroundColor Cyan
Write-Host ""

# --- 0. Clean up old Electron dashboard --------------------------------------
Write-Host "[0/5] Cleaning up old Electron dashboard..." -ForegroundColor Yellow
$electronDir = Join-Path $PSScriptRoot "lpups-dashboard"
if (Test-Path $electronDir) {
    Write-Host "  Removing old Electron dashboard: $electronDir"
    Remove-Item -Recurse -Force $electronDir -ErrorAction SilentlyContinue
    Write-Host "  Removed." -ForegroundColor Green
} else {
    Write-Host "  No old Electron dashboard found - clean." -ForegroundColor Green
}

# Remove old Electron startup shortcut if it exists
$startup = [Environment]::GetFolderPath("Startup")
$oldShortcuts = @(
    (Join-Path $startup "LPUPS Dashboard.lnk"),
    (Join-Path $startup "LPUPS.lnk")
)
foreach ($sc in $oldShortcuts) {
    if (Test-Path $sc) {
        $item = Get-Item $sc -ErrorAction SilentlyContinue
        # Check if it points to electron/node
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($sc)
        if ($link.TargetPath -like "*electron*" -or $link.TargetPath -like "*node*") {
            Remove-Item $sc -Force
            Write-Host "  Removed old Electron startup shortcut: $sc" -ForegroundColor Green
        }
    }
}

# --- 1. Stream Deck: npm install ---------------------------------------------
Write-Host ""
Write-Host "[1/5] Installing Stream Deck plugin dependencies..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} finally { Pop-Location }

# --- 2. Stream Deck: build ---------------------------------------------------
Write-Host ""
Write-Host "[2/5] Building Stream Deck plugin..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally { Pop-Location }

# --- 3. Stream Deck: junction ------------------------------------------------
Write-Host ""
Write-Host "[3/5] Creating Stream Deck plugin junction..." -ForegroundColor Yellow

if (-not (Test-Path $sdPlugins)) {
    Write-Host "  Creating plugins directory: $sdPlugins"
    New-Item -ItemType Directory -Path $sdPlugins -Force | Out-Null
}

if (Test-Path $junctionTarget) {
    $item = Get-Item $junctionTarget -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "  Junction already exists - removing old one."
        cmd /c "rmdir `"$junctionTarget`"" | Out-Null
    } else {
        Write-Host "  WARNING: $junctionTarget exists and is NOT a junction." -ForegroundColor Red
        Write-Host "  Back it up manually and re-run setup." -ForegroundColor Red
        exit 1
    }
}

cmd /c "mklink /J `"$junctionTarget`" `"$pluginSrc`""
if ($LASTEXITCODE -ne 0) { throw "mklink /J failed" }

# --- 4. Qt Dashboard: pip install --------------------------------------------
Write-Host ""
Write-Host "[4/5] Installing Qt Dashboard dependencies..." -ForegroundColor Yellow
if (Test-Path $qtDashboard) {
    Push-Location $qtDashboard
    try {
        pip install -r requirements.txt --quiet
        if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
        Write-Host "  Python dependencies installed." -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: pip install failed. Install Python 3.10+ and retry." -ForegroundColor Yellow
        Write-Host "  Error: $_" -ForegroundColor Yellow
    } finally { Pop-Location }
} else {
    Write-Host "  Qt Dashboard not found at: $qtDashboard" -ForegroundColor Yellow
}

# --- 5. Qt Dashboard: startup shortcut --------------------------------------
Write-Host ""
Write-Host "[5/5] Creating Qt Dashboard startup shortcut..." -ForegroundColor Yellow

$shortcutPath = Join-Path $startup "LPUPS Dashboard.lnk"
try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "pythonw.exe"
    $shortcut.Arguments = "`"$qtDashboard\main.py`""
    $shortcut.WorkingDirectory = $qtDashboard
    $shortcut.Description = "LPUPS Battery Dashboard (Qt)"
    $shortcut.Save()
    Write-Host "  Startup shortcut created: $shortcutPath" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Could not create startup shortcut: $_" -ForegroundColor Yellow
}

# --- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Stream Deck Plugin : $junctionTarget" -ForegroundColor White
Write-Host "  Qt Dashboard       : $qtDashboard" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart Stream Deck:" -ForegroundColor White
Write-Host "     Stop-Process -Name StreamDeck -Force" -ForegroundColor Gray
Write-Host "     Start-Process '$env:ProgramFiles\Elgato\StreamDeck\StreamDeck.exe'" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start Qt Dashboard:" -ForegroundColor White
Write-Host "     python $qtDashboard\main.py --dev" -ForegroundColor Gray
Write-Host ""
Write-Host "For future updates run:  .\update.ps1" -ForegroundColor Cyan
Write-Host ""
