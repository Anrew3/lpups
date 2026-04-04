# serial-reader.ps1
# Finds the Arduino COM port, opens it at 115200 baud, and streams every
# line to stdout.  The Node.js plugin spawns this script and reads its stdout.
# Reconnects automatically if the port closes.

param([string]$PortOverride = "AUTO")

function Find-ArduinoPort {
    # Look for a device whose name contains "Arduino" or a recognised clone chip
    $device = Get-WmiObject Win32_PnPEntity -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -match "Arduino" -or
            $_.Name -match "USB Serial" -or
            $_.Name -match "CH340"  -or
            $_.Name -match "CP210"
        } |
        Where-Object { $_.Name -match "COM\d+" } |
        Select-Object -First 1

    if ($device) {
        return [regex]::Match($device.Name, "COM\d+").Value
    }
    return $null
}

$portName = if ($PortOverride -ne "AUTO") { $PortOverride } else { Find-ArduinoPort }

if (-not $portName) {
    Write-Host "ERROR:NO_ARDUINO_PORT"
    Start-Sleep -Seconds 5
    exit 1
}

try {
    $port = New-Object System.IO.Ports.SerialPort($portName, 115200)
    $port.ReadTimeout  = 8000   # 8 s — longer than the 3 s Arduino cycle
    $port.NewLine      = "`n"
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
            # No data in 8 s — Arduino might have reset; keep waiting
        }
        catch {
            break
        }
    }

    $port.Close()
}
catch {
    Write-Host "ERROR:$($_.Exception.Message)"
    exit 1
}
