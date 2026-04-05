#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time setup for the LPUPS Stream Deck plugin.
  Run this once after cloning the repo on the LattePanda.

  What it does:
    1. npm install  - installs Node dependencies
    2. npm run build - compiles TypeScript to bin/plugin.js
    3. mklink /J   - links Stream Deck plugins folder to this repo
                     so future updates only need: .\update.ps1

  Usage (Admin PowerShell from repo root):
    .\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pluginId       = "com.lpups.casepanel.sdPlugin"
$pluginSrc      = Join-Path $PSScriptRoot "streamdeck\$pluginId"
$sdPlugins      = "$env:APPDATA\Elgato\StreamDeck\Plugins"
$junctionTarget = Join-Path $sdPlugins $pluginId

Write-Host ""
Write-Host "=== LPUPS Stream Deck Plugin - First-Time Setup ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. npm install -----------------------------------------------------------
Write-Host "[1/3] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} finally { Pop-Location }

# --- 2. Build ----------------------------------------------------------------
Write-Host ""
Write-Host "[2/3] Building plugin..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally { Pop-Location }

# --- 3. Directory junction ---------------------------------------------------
Write-Host ""
Write-Host "[3/3] Creating Stream Deck plugin junction..." -ForegroundColor Yellow

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

# --- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Plugin : $junctionTarget"
Write-Host "  Source : $pluginSrc"
Write-Host ""
Write-Host "Restart Stream Deck software now:" -ForegroundColor Cyan
Write-Host "  Stop-Process -Name StreamDeck -Force"
Write-Host "  Start-Process '$env:ProgramFiles\Elgato\StreamDeck\StreamDeck.exe'"
Write-Host ""
Write-Host "For future updates run:  .\update.ps1" -ForegroundColor Cyan
Write-Host ""
