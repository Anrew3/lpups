# serial-reader.ps1
# Opens the Arduino/LPUPS COM port at 115200 baud and streams every line to stdout.
# Auto-detects the port via WMI; if that fails, scans all available COM ports.
# Reconnects automatically when the port closes.

param([string]$PortOverride = "AUTO")

# ---- Port discovery ---------------------------------------------------------

function Find-ArduinoPort {
    # Search WMI PnP entities for any USB serial / Arduino / DFRobot device
    $device = Get-WmiObject Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match "Arduino"    -or
            $_.Name -match "DFRobot"   -or
            $_.Name -match "USB Serial" -or
            $_.Name -match "USB-Serial" -or
            $_.Name -match "CH340"     -or
            $_.Name -match "CP210"     -or
            $_.Name -match "LPUPS"
        } |
        Where-Object { $_.Name -match "COM\d+" } |
        Select-Object -First 1

    if ($device) {
        $port = [regex]::Match($device.Name, "COM\d+").Value
        Write-Host "INFO:WMI found $($device.Name) on $port"
        return $port
    }

    # Fallback: return all .NET-enumerated COM ports for the caller to try
    return $null
}

# ---- Open and read ----------------------------------------------------------

function Open-AndRead($portName) {
    try {
        $port = New-Object System.IO.Ports.SerialPort($portName, 115200)
        $port.ReadTimeout = 8000
        $port.NewLine     = "`n"
        $port.Open()

        Write-Host "CONNECTED:$portName"
        [Console]::Out.Flush()

        while ($true) {
            try {
                $line = $port.ReadLine()
                Write-Host $line.TrimEnd("`r")
                [Console]::Out.Flush()
            }
            catch [System.TimeoutException] {
                # No data in 8 s — Arduino may have reset; keep waiting
            }
            catch {
                break
            }
        }

        $port.Close()
        return $true
    }
    catch {
        return $false
    }
}

# ---- Main loop --------------------------------------------------------------

if ($PortOverride -ne "AUTO") {
    # Explicit port specified — use it forever
    while ($true) {
        Open-AndRead $PortOverride | Out-Null
        Write-Host "INFO:Port $PortOverride closed, retrying in 5s..."
        Start-Sleep -Seconds 5
    }
}

# Auto-detect loop: re-detect and retry on every disconnect
while ($true) {
    $portName = Find-ArduinoPort

    if (-not $portName) {
        # WMI found nothing — try every COM port .NET knows about
        $allPorts = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object
        if ($allPorts.Count -eq 0) {
            Write-Host "ERROR:NO_COM_PORTS"
            [Console]::Out.Flush()
            Start-Sleep -Seconds 8
            continue
        }

        Write-Host "INFO:WMI no match, scanning ports: $($allPorts -join ', ')"
        [Console]::Out.Flush()

        $portName = $null
        foreach ($p in $allPorts) {
            Write-Host "INFO:Trying $p..."
            [Console]::Out.Flush()
            $ok = Open-AndRead $p
            if ($ok) {
                $portName = $p
                break
            }
        }

        if (-not $portName) {
            Write-Host "ERROR:NO_ARDUINO_PORT"
            [Console]::Out.Flush()
            Start-Sleep -Seconds 8
        }
        continue
    }

    # WMI found a candidate — open it
    $ok = Open-AndRead $portName
    if (-not $ok) {
        Write-Host "ERROR:Could not open $portName"
        [Console]::Out.Flush()
        Start-Sleep -Seconds 5
    } else {
        # Port closed gracefully — small pause before reconnect
        Start-Sleep -Seconds 2
    }
}
