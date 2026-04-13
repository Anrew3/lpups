"""
serial_reader.py
QThread-based serial reader using pyserial.
Directly reads Arduino telemetry — no PowerShell subprocess needed.
Auto-detects LattePanda Leonardo / Arduino / DFRobot COM ports.
Reconnects automatically on disconnect.
"""

import re
import time
import logging

from PySide6.QtCore import QThread, Signal
import serial
import serial.tools.list_ports

log = logging.getLogger("serial")

BAUD = 115200
READ_TIMEOUT = 8          # seconds
RECONNECT_DELAY = 6       # seconds
KNOWN_DEVICES = re.compile(
    r"arduino|lattepanda|leonardo|dfrobot|ch340|cp210|lpups|usb.serial",
    re.IGNORECASE,
)


class SerialReaderThread(QThread):
    """Reads Arduino serial in a background thread, emits parsed data."""

    data_updated = Signal(dict)        # full UPS state dict
    event_received = Signal(str)       # Arduino event message
    connected = Signal(str)            # port name
    disconnected = Signal()
    error_occurred = Signal(str)       # error description

    def __init__(self, port_override: str = "AUTO", parent=None):
        super().__init__(parent)
        self._port_override = port_override
        self._running = True

        # Parsed state
        self._state = {
            "connected": False,
            "timestamp": 0,
            "b1": {
                "voltage": 0, "capacity": 0, "current": 0,
                "acPresent": False, "charging": False, "temperature": 0,
                "runtime": 0,
            },
        }

    def stop(self):
        self._running = False
        self.wait(5000)

    # ── Port detection ──────────────────────────────────────────────────

    @staticmethod
    def find_arduino_port() -> str | None:
        """Scan for Arduino/LattePanda Leonardo COM port."""
        ports = serial.tools.list_ports.comports()
        for p in ports:
            desc = f"{p.description} {p.manufacturer or ''}"
            if KNOWN_DEVICES.search(desc):
                log.info(f"Auto-detected: {p.device} ({p.description})")
                return p.device
        # Fallback: list all ports for debugging
        if ports:
            names = ", ".join(p.device for p in ports)
            log.warning(f"No Arduino match. Available: {names}")
        else:
            log.warning("No COM ports found at all")
        return None

    @staticmethod
    def list_all_ports() -> list[dict]:
        """Return all COM ports for diagnostics."""
        return [
            {"port": p.device, "desc": p.description, "hwid": p.hwid}
            for p in serial.tools.list_ports.comports()
        ]

    # ── Main thread loop ────────────────────────────────────────────────

    def run(self):
        while self._running:
            port_name = self._port_override if self._port_override != "AUTO" else self.find_arduino_port()

            if not port_name:
                self.error_occurred.emit("No Arduino COM port found")
                self._sleep(RECONNECT_DELAY)
                continue

            try:
                self._read_port(port_name)
            except serial.SerialException as e:
                log.error(f"Serial error on {port_name}: {e}")
                self.error_occurred.emit(str(e))
            except Exception as e:
                log.error(f"Unexpected error: {e}")
                self.error_occurred.emit(str(e))

            # Mark disconnected
            if self._state["connected"]:
                self._state["connected"] = False
                self.disconnected.emit()

            if self._running:
                log.info(f"Reconnecting in {RECONNECT_DELAY}s...")
                self._sleep(RECONNECT_DELAY)

    def _read_port(self, port_name: str):
        """Open port and read lines until disconnect or stop."""
        with serial.Serial(port_name, BAUD, timeout=READ_TIMEOUT) as ser:
            log.info(f"Connected to {port_name} at {BAUD} baud")
            self._state["connected"] = True
            self.connected.emit(port_name)

            while self._running:
                try:
                    raw = ser.readline()
                    if not raw:
                        continue  # timeout, keep waiting
                    line = raw.decode("utf-8", errors="replace").strip()
                    if line:
                        self._parse_line(line)
                except serial.SerialException:
                    raise  # re-raise to trigger reconnect
                except UnicodeDecodeError:
                    continue

    # ── Line parser ─────────────────────────────────────────────────────

    def _parse_line(self, line: str):
        """Parse a single serial line into state fields."""
        # Event lines
        if line.startswith("!!!") or line.startswith(">>>"):
            self.event_received.emit(line)
            return
        if line.startswith("EVENT:"):
            self.event_received.emit(line[6:].strip())
            return

        # Info/error lines from PowerShell relay (if used)
        if line.startswith("CONNECTED:") or line.startswith("INFO:") or line.startswith("ERROR:"):
            return

        lower = line.lower()

        # Extract numeric value from "key = value unit" format
        def num_val() -> int:
            m = re.search(r"-?\d+", line)
            return int(m.group()) if m else 0

        def bool_val() -> bool:
            return bool(re.search(r"=\s*1", line) or re.search(r"=\s*(?:yes|true)", line, re.I))

        b1 = self._state["b1"]

        # B1 fields
        if "b1 voltage" in lower:
            b1["voltage"] = num_val()
        elif "b1 capacity" in lower:
            b1["capacity"] = num_val()
        elif "b1 current" in lower:
            b1["current"] = num_val()
        elif "b1 ac" in lower:
            b1["acPresent"] = bool_val()
        elif "b1 charg" in lower:
            b1["charging"] = bool_val()
        elif "b1 temp" in lower:
            b1["temperature"] = num_val()
        elif "b1 runtime" in lower:
            b1["runtime"] = num_val()
        else:
            return  # unrecognized line, skip emit

        # Emit updated state
        self._state["timestamp"] = time.time()
        self.data_updated.emit(dict(self._state))

    def _sleep(self, seconds: float):
        """Interruptible sleep."""
        end = time.time() + seconds
        while self._running and time.time() < end:
            self.msleep(250)
