# update.ps1 - Pull latest code and redeploy LPUPS Dashboard
# Run as Administrator.

#Requires -Version 5.1

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$InstallDir = "C:\LPUPS"
$DashDir    = "$InstallDir\lpups-dashboard"
$SDDir      = "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin"
$SDDest     = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.lpups.casepanel.sdPlugin"
$BackupDir  = "$InstallDir\_backups\$(Get-Date -Format 'yyyyMMdd-HHmm')"

Write-Host ""
Write-Host "============================================"
Write-Host "  LPUPS Dashboard - Update"
Write-Host "============================================"
Write-Host ""

# Stop running app
Write-Host "Stopping dashboard..."
Stop-ScheduledTask -TaskName "LPUPS Dashboard" -ErrorAction SilentlyContinue
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "[OK] App stopped"

# Backup current build
Write-Host "Backing up to $BackupDir..."
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
Copy-Item -Recurse -Force "$DashDir\out" "$BackupDir\out" -ErrorAction SilentlyContinue
Write-Host "[OK] Backup saved"

# Pull latest
Write-Host "Pulling latest code..."
git -C $InstallDir pull origin main
Write-Host "[OK] Code updated"

# Rebuild dashboard
Write-Host "Building dashboard..."
Set-Location $DashDir
npm install --prefer-offline
npm run build

if (-not (Test-Path "$DashDir\out\main\index.js")) {
    Write-Host "[FAIL] Build failed - restoring backup"
    Copy-Item -Recurse -Force "$BackupDir\out" "$DashDir\out"
    exit 1
}
Write-Host "[OK] Dashboard built"

# Rebuild Stream Deck plugin
Write-Host "Updating Stream Deck plugin..."
Set-Location $SDDir
npm install --prefer-offline
npm run build
if (Test-Path $SDDest) { Remove-Item -Recurse -Force $SDDest }
Copy-Item -Recurse -Force $SDDir $SDDest
Write-Host "[OK] Stream Deck plugin updated"

# Restart
Write-Host "Restarting dashboard..."
Start-ScheduledTask -TaskName "LPUPS Dashboard" -ErrorAction SilentlyContinue

$pkg = Get-Content "$DashDir\package.json" | ConvertFrom-Json

Write-Host ""
Write-Host "============================================"
Write-Host "  Update complete - v$($pkg.version)"
Write-Host "  Backup at: $BackupDir"
Write-Host "============================================"
Write-Host ""
