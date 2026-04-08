<#
.SYNOPSIS
  Pull latest code, clean up old files, rebuild everything.

  Usage (from repo root):
    .\update.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pluginSrc   = Join-Path $PSScriptRoot "streamdeck\com.lpups.casepanel.sdPlugin"
$qtDashboard = Join-Path $PSScriptRoot "lpups-qt-dashboard"

Write-Host ""
Write-Host "=== LPUPS System Update ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Pull latest ----------------------------------------------------------
Write-Host "[1/4] Pulling latest from GitHub..." -ForegroundColor Yellow
git -C $PSScriptRoot pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# --- 2. Clean up old Electron dashboard --------------------------------------
Write-Host ""
Write-Host "[2/4] Cleaning up old files..." -ForegroundColor Yellow
$electronDir = Join-Path $PSScriptRoot "lpups-dashboard"
if (Test-Path $electronDir) {
    Write-Host "  Removing old Electron dashboard..."
    Remove-Item -Recurse -Force $electronDir -ErrorAction SilentlyContinue
    Write-Host "  Removed lpups-dashboard/" -ForegroundColor Green
} else {
    Write-Host "  No old files to clean up." -ForegroundColor Green
}

# Clean up any old Electron node_modules or build artifacts
$oldArtifacts = @(
    (Join-Path $electronDir "node_modules"),
    (Join-Path $electronDir "out"),
    (Join-Path $electronDir ".vite"),
    (Join-Path $electronDir "release")
)
foreach ($artifact in $oldArtifacts) {
    if (Test-Path $artifact) {
        Remove-Item -Recurse -Force $artifact -ErrorAction SilentlyContinue
        Write-Host "  Cleaned: $artifact" -ForegroundColor Green
    }
}

# --- 3. Build Stream Deck plugin --------------------------------------------
Write-Host ""
Write-Host "[3/4] Building Stream Deck plugin..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    Write-Host "  Stream Deck plugin built." -ForegroundColor Green
} finally { Pop-Location }

# --- 4. Update Qt Dashboard dependencies ------------------------------------
Write-Host ""
Write-Host "[4/4] Updating Qt Dashboard..." -ForegroundColor Yellow
if (Test-Path $qtDashboard) {
    Push-Location $qtDashboard
    try {
        pip install -r requirements.txt --quiet --upgrade 2>$null
        Write-Host "  Qt Dashboard dependencies updated." -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: pip install failed: $_" -ForegroundColor Yellow
    } finally { Pop-Location }
} else {
    Write-Host "  Qt Dashboard not found - skipping." -ForegroundColor Yellow
}

# --- 5. Restart Stream Deck -------------------------------------------------
Write-Host ""
Write-Host "[5/4] Restarting Stream Deck..." -ForegroundColor Yellow
$proc = Get-Process -Name "StreamDeck" -ErrorAction SilentlyContinue
if ($proc) {
    $proc | Stop-Process -Force
    Start-Sleep -Seconds 2
}
$sdExe = "$env:ProgramFiles\Elgato\StreamDeck\StreamDeck.exe"
if (Test-Path $sdExe) {
    Start-Process $sdExe
    Write-Host "  Stream Deck restarted." -ForegroundColor Green
} else {
    Write-Host "  Stream Deck not found - start it manually." -ForegroundColor Yellow
}

# --- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "=== Update complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  To start Qt Dashboard:  python $qtDashboard\main.py --dev" -ForegroundColor White
Write-Host ""
