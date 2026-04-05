<#
.SYNOPSIS
  Pull latest code and rebuild the LPUPS Stream Deck plugin.

  Usage (from repo root):
    .\update.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pluginSrc = Join-Path $PSScriptRoot "streamdeck\com.lpups.casepanel.sdPlugin"

Write-Host ""
Write-Host "=== LPUPS Plugin Update ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Pull latest ----------------------------------------------------------
Write-Host "[1/3] Pulling latest from GitHub..." -ForegroundColor Yellow
git -C $PSScriptRoot pull
if ($LASTEXITCODE -ne 0) { throw "git pull failed" }

# --- 2. Build ----------------------------------------------------------------
Write-Host ""
Write-Host "[2/3] Building plugin..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally { Pop-Location }

# --- 3. Restart Stream Deck --------------------------------------------------
Write-Host ""
Write-Host "[3/3] Restarting Stream Deck..." -ForegroundColor Yellow
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

Write-Host ""
Write-Host "=== Update complete! ===" -ForegroundColor Green
Write-Host ""
