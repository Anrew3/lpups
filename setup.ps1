#Requires -RunAsAdministrator
<#
.SYNOPSIS
  One-time setup for the LPUPS Stream Deck plugin.
  Run this once after cloning the repo on the LattePanda.

  What it does:
    1. Installs Node.js dependencies (npm install)
    2. Builds the plugin (npm run build)
    3. Creates a Windows directory junction from the Stream Deck plugins
       folder directly to this repo's plugin folder — so future updates
       only need: git pull + npm run build (handled by update.ps1)

  Usage (from repo root, in an Admin PowerShell):
    .\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$pluginId  = "com.lpups.casepanel.sdPlugin"
$pluginSrc = Join-Path $PSScriptRoot "streamdeck\$pluginId"
$sdPlugins = "$env:APPDATA\Elgato\StreamDeck\Plugins"
$junctionTarget = Join-Path $sdPlugins $pluginId

Write-Host ""
Write-Host "=== LPUPS Stream Deck Plugin — First-Time Setup ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. npm install ────────────────────────────────────────────────────────────
Write-Host "[1/3] Installing npm dependencies..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} finally { Pop-Location }

# ── 2. Build ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[2/3] Building plugin..." -ForegroundColor Yellow
Push-Location $pluginSrc
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally { Pop-Location }

# ── 3. Directory junction ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/3] Creating Stream Deck plugin junction..." -ForegroundColor Yellow

if (-not (Test-Path $sdPlugins)) {
    Write-Host "  Creating plugins directory: $sdPlugins"
    New-Item -ItemType Directory -Path $sdPlugins -Force | Out-Null
}

if (Test-Path $junctionTarget) {
    $item = Get-Item $junctionTarget -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "  Junction already exists — removing old one."
        cmd /c "rmdir `"$junctionTarget`"" | Out-Null
    } else {
        Write-Host "  WARNING: $junctionTarget exists and is NOT a junction." -ForegroundColor Red
        Write-Host "  Back it up manually and re-run setup if needed." -ForegroundColor Red
        exit 1
    }
}

cmd /c "mklink /J `"$junctionTarget`" `"$pluginSrc`""
if ($LASTEXITCODE -ne 0) { throw "mklink /J failed" }

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "  Plugin location : $junctionTarget"
Write-Host "  (points to)       $pluginSrc"
Write-Host ""
Write-Host "Restart Stream Deck software now:" -ForegroundColor Cyan
Write-Host "  Stop-Process -Name 'StreamDeck' -Force; Start-Sleep 2; Start-Process 'StreamDeck'"
Write-Host ""
Write-Host "For future updates just run:  .\update.ps1" -ForegroundColor Cyan
Write-Host ""
