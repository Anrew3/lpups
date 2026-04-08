# install.ps1 — LPUPS Qt Dashboard installer
# Run as Administrator for startup shortcut creation

param([switch]$NoStartup)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "`n=== LPUPS Qt Dashboard Installer ===" -ForegroundColor Cyan

# 1. Check Python
Write-Host "`n[1/4] Checking Python..." -ForegroundColor Yellow
try {
    $pyVer = python --version 2>&1
    Write-Host "  Found: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "  Python not found! Install Python 3.10+ from python.org" -ForegroundColor Red
    exit 1
}

# 2. Install dependencies
Write-Host "`n[2/4] Installing Python packages..." -ForegroundColor Yellow
Set-Location $root
pip install -r requirements.txt --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "  pip install failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# 3. Clean up old Electron dashboard if present
Write-Host "`n[3/4] Cleaning up old files..." -ForegroundColor Yellow
$electronDir = Join-Path (Split-Path -Parent $root) "lpups-dashboard"
if (Test-Path $electronDir) {
    Write-Host "  Removing old Electron dashboard..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $electronDir -ErrorAction SilentlyContinue
    Write-Host "  Old Electron dashboard removed" -ForegroundColor Green
} else {
    Write-Host "  No old files to clean up" -ForegroundColor Green
}

# 4. Create startup shortcut (optional)
if (!$NoStartup) {
    Write-Host "`n[4/4] Creating startup shortcut..." -ForegroundColor Yellow
    $startup = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startup "LPUPS Dashboard.lnk"

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "pythonw.exe"
    $shortcut.Arguments = "`"$root\main.py`""
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = "LPUPS Battery Dashboard"
    $shortcut.Save()

    Write-Host "  Startup shortcut created at: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "`n[4/4] Skipping startup shortcut (--NoStartup)" -ForegroundColor Yellow
}

Write-Host "`n=== Installation Complete ===" -ForegroundColor Cyan
Write-Host "  Run:  python main.py --dev    (windowed)" -ForegroundColor White
Write-Host "  Run:  pythonw main.py          (fullscreen, no console)" -ForegroundColor White
Write-Host ""
