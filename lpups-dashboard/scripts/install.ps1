# install.ps1 — First-time LPUPS setup for LattePanda
# Run as Administrator.  Sets up Node, builds the app, and registers autostart.

#Requires -Version 5.1

# ── Elevation check ───────────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "Relaunching as Administrator…"
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"
$InstallDir = "C:\LPUPS"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  LPUPS Dashboard — First-Time Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Execution policy ─────────────────────────────────────────────────────────
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned -Force
Write-Host "[OK] Execution policy set" -ForegroundColor Green

# ── Disable sleep / hibernate ─────────────────────────────────────────────────
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /h off
Write-Host "[OK] Sleep and hibernate disabled" -ForegroundColor Green

# ── Install Node.js if missing ────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js 20 LTS via winget…"
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Host "[OK] Node $(node --version)  npm $(npm --version)" -ForegroundColor Green

# ── Clone or copy repo ────────────────────────────────────────────────────────
if (-not (Test-Path $InstallDir)) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "Cloning repo to $InstallDir…"
        git clone https://github.com/Anrew3/lpups.git $InstallDir
    } else {
        Write-Error "Git not found and $InstallDir does not exist. Install Git first or copy the folder manually to $InstallDir."
    }
} else {
    Write-Host "[OK] $InstallDir already exists" -ForegroundColor Green
}

# ── Build dashboard ───────────────────────────────────────────────────────────
Write-Host "Building dashboard…"
Set-Location "$InstallDir\lpups-dashboard"
npm install --prefer-offline
npm run build
Write-Host "[OK] Dashboard built" -ForegroundColor Green

# ── Build Stream Deck plugin ──────────────────────────────────────────────────
Write-Host "Building Stream Deck plugin…"
Set-Location "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin"
npm install --prefer-offline
npm run build
$sdDest = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.lpups.casepanel.sdPlugin"
if (Test-Path "$sdDest") { Remove-Item -Recurse -Force $sdDest }
Copy-Item -Recurse -Force "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin" $sdDest
Write-Host "[OK] Stream Deck plugin installed" -ForegroundColor Green

# ── Task Scheduler — autostart at logon ──────────────────────────────────────
Write-Host "Registering Task Scheduler entry…"
$exePath   = (Get-Command npm).Source
$dashDir   = "$InstallDir\lpups-dashboard"

$action    = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -Command `"Set-Location '$dashDir'; npm start`"" `
    -WorkingDirectory $dashDir

$trigger   = New-ScheduledTaskTrigger -AtLogon
$settings  = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit 0 `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName "LPUPS Dashboard" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Write-Host "[OK] Task Scheduler entry created — will start at next login" -ForegroundColor Green

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Setup complete!  Reboot the LattePanda." -ForegroundColor Cyan
Write-Host "  Dashboard will launch automatically."     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Press Enter to reboot now, or Ctrl+C to cancel"
Restart-Computer -Force
