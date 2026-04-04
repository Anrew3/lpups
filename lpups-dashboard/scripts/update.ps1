# update.ps1 — Pull latest code and redeploy
# Run as Administrator.  Stops the app, pulls, rebuilds, restarts.

#Requires -Version 5.1

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$InstallDir  = "C:\LPUPS"
$DashDir     = "$InstallDir\lpups-dashboard"
$SDDir       = "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin"
$SDDest      = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.lpups.casepanel.sdPlugin"
$BackupDir   = "$InstallDir\_backups\$(Get-Date -Format 'yyyyMMdd-HHmm')"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  LPUPS Dashboard — Update" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Stop running app ──────────────────────────────────────────────────────────
Write-Host "Stopping dashboard…"
Stop-ScheduledTask -TaskName "LPUPS Dashboard" -ErrorAction SilentlyContinue
Get-Process -Name "electron","electron.exe" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "[OK] App stopped" -ForegroundColor Green

# ── Backup ────────────────────────────────────────────────────────────────────
Write-Host "Backing up to $BackupDir…"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
Copy-Item -Recurse -Force "$DashDir\out" "$BackupDir\out" -ErrorAction SilentlyContinue
Write-Host "[OK] Backup saved" -ForegroundColor Green

# ── Pull ──────────────────────────────────────────────────────────────────────
Write-Host "Pulling latest code…"
git -C $InstallDir pull origin main
Write-Host "[OK] Code updated" -ForegroundColor Green

# ── Rebuild dashboard ─────────────────────────────────────────────────────────
Write-Host "Building dashboard…"
Set-Location $DashDir
npm install --prefer-offline
npm run build

if (-not (Test-Path "$DashDir\out\main\index.js")) {
    Write-Host "[FAIL] Build failed — restoring backup" -ForegroundColor Red
    Copy-Item -Recurse -Force "$BackupDir\out" "$DashDir\out"
    exit 1
}
Write-Host "[OK] Dashboard built" -ForegroundColor Green

# ── Rebuild + reinstall Stream Deck plugin ────────────────────────────────────
Write-Host "Updating Stream Deck plugin…"
Set-Location $SDDir
npm install --prefer-offline
npm run build
if (Test-Path $SDDest) { Remove-Item -Recurse -Force $SDDest }
Copy-Item -Recurse -Force $SDDir $SDDest
Write-Host "[OK] Stream Deck plugin updated" -ForegroundColor Green

# ── Restart ───────────────────────────────────────────────────────────────────
Write-Host "Restarting dashboard…"
Start-ScheduledTask -TaskName "LPUPS Dashboard" -ErrorAction SilentlyContinue

# Read version from package.json
$pkg = Get-Content "$DashDir\package.json" | ConvertFrom-Json

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Update complete — v$($pkg.version)"        -ForegroundColor Green
Write-Host "  Backup kept at: $BackupDir"                -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
