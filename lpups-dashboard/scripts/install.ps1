# install.ps1 - First-time LPUPS setup for LattePanda
# Run as Administrator.

#Requires -Version 5.1

# Elevation check
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "Relaunching as Administrator..."
    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$InstallDir = "C:\LPUPS"

Write-Host ""
Write-Host "============================================"
Write-Host "  LPUPS Dashboard - First-Time Setup"
Write-Host "============================================"
Write-Host ""

# Execution policy (non-fatal)
try {
    Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned -Force
} catch {
    Write-Host "[SKIP] Execution policy already managed by group policy"
}
Write-Host "[OK] Execution policy"

# Disable sleep / hibernate
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /h off
Write-Host "[OK] Sleep and hibernate disabled"

# Install Node.js if missing
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js 20 LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Host "[OK] Node $(node --version)  npm $(npm --version)"

# Clone or use existing repo
if (-not (Test-Path $InstallDir)) {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host "Cloning repo to $InstallDir..."
        git clone https://github.com/Anrew3/lpups.git $InstallDir
    } else {
        Write-Host "[ERROR] Git not found and $InstallDir does not exist."
        Write-Host "        Install Git first or copy the folder to $InstallDir manually."
        exit 1
    }
} else {
    Write-Host "[OK] $InstallDir already exists"
}

# Build dashboard
Write-Host "Building dashboard..."
Set-Location "$InstallDir\lpups-dashboard"
npm install --prefer-offline
npm run build
Write-Host "[OK] Dashboard built"

# Build and install Stream Deck plugin
Write-Host "Building Stream Deck plugin..."
Set-Location "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin"
npm install --prefer-offline
npm run build
$sdDest = "$env:APPDATA\Elgato\StreamDeck\Plugins\com.lpups.casepanel.sdPlugin"
if (Test-Path $sdDest) { Remove-Item -Recurse -Force $sdDest }
Copy-Item -Recurse -Force "$InstallDir\streamdeck\com.lpups.casepanel.sdPlugin" $sdDest
Write-Host "[OK] Stream Deck plugin installed"

# Task Scheduler - autostart at logon
Write-Host "Registering Task Scheduler entry..."
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

Write-Host "[OK] Task Scheduler entry created"

Write-Host ""
Write-Host "============================================"
Write-Host "  Setup complete!  Reboot the LattePanda."
Write-Host "  Dashboard will launch automatically."
Write-Host "============================================"
Write-Host ""

$reboot = Read-Host "Reboot now? [Y/N]"
if ($reboot -eq "Y" -or $reboot -eq "y") {
    Restart-Computer -Force
}
