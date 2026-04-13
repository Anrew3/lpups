"""
data_models.py
QObject-based data models with Qt Properties for QML binding.
All UPS telemetry is exposed here — the serial reader updates these,
and QML binds to them for live display.
"""

from PySide6.QtCore import QObject, Signal, Property, Slot
import time


class UPSDataModel(QObject):
    """Central data model exposed to QML as 'upsData'."""

    # ── Notify signals ──────────────────────────────────────────────────
    connectedChanged = Signal()
    timestampChanged = Signal()

    # B1
    b1VoltageChanged = Signal()
    b1CapacityChanged = Signal()
    b1CurrentChanged = Signal()
    b1AcPresentChanged = Signal()
    b1ChargingChanged = Signal()
    b1TemperatureChanged = Signal()
    b1RuntimeChanged = Signal()

    # Connection
    serialPortChanged = Signal()
    lastErrorChanged = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._connected = False
        self._timestamp = 0
        self._serial_port = ""
        self._last_error = ""

        # B1 fields
        self._b1_voltage = 0
        self._b1_capacity = 0
        self._b1_current = 0
        self._b1_ac_present = False
        self._b1_charging = False
        self._b1_temperature = 0
        self._b1_runtime = 0

    # ── Properties ──────────────────────────────────────────────────────

    @Property(bool, notify=connectedChanged)
    def connected(self):
        return self._connected

    @connected.setter
    def connected(self, v):
        if self._connected != v:
            self._connected = v
            self.connectedChanged.emit()

    @Property(float, notify=timestampChanged)
    def timestamp(self):
        return self._timestamp

    @Property(str, notify=serialPortChanged)
    def serialPort(self):
        return self._serial_port

    @serialPort.setter
    def serialPort(self, v):
        if self._serial_port != v:
            self._serial_port = v
            self.serialPortChanged.emit()

    @Property(str, notify=lastErrorChanged)
    def lastError(self):
        return self._last_error

    @lastError.setter
    def lastError(self, v):
        if self._last_error != v:
            self._last_error = v
            self.lastErrorChanged.emit()

    # ── B1 Properties ───────────────────────────────────────────────────

    @Property(int, notify=b1VoltageChanged)
    def b1Voltage(self):
        return self._b1_voltage

    @Property(int, notify=b1CapacityChanged)
    def b1Capacity(self):
        return self._b1_capacity

    @Property(int, notify=b1CurrentChanged)
    def b1Current(self):
        return self._b1_current

    @Property(bool, notify=b1AcPresentChanged)
    def b1AcPresent(self):
        return self._b1_ac_present

    @Property(bool, notify=b1ChargingChanged)
    def b1Charging(self):
        return self._b1_charging

    @Property(int, notify=b1TemperatureChanged)
    def b1Temperature(self):
        return self._b1_temperature

    @Property(int, notify=b1RuntimeChanged)
    def b1Runtime(self):
        return self._b1_runtime

    # ── Computed properties for QML ─────────────────────────────────────

    @Property(str, notify=b1VoltageChanged)
    def b1VoltageStr(self):
        if self._b1_voltage <= 0:
            return "--"
        return f"{self._b1_voltage / 1000:.2f}V"

    @Property(str, notify=b1CurrentChanged)
    def b1CurrentStr(self):
        ma = self._b1_current
        if ma == 0:
            return "--"
        if abs(ma) >= 1000:
            return f"{ma / 1000:.1f}A"
        return f"{ma}mA"

    @Property(str, notify=b1CurrentChanged)
    def b1CurrentDirection(self):
        if self._b1_current > 0:
            return "Charging"
        elif self._b1_current < 0:
            return "Discharging"
        return "Idle"

    @Property(str, notify=b1RuntimeChanged)
    def b1RuntimeStr(self):
        s = self._b1_runtime
        if s <= 0:
            return "--"
        m = s // 60
        if m >= 60:
            return f"{m // 60}h {m % 60}m"
        return f"{m}m"

    # ── Bulk update (called from serial reader thread via signal) ──────

    @Slot("QVariant")
    def updateFromDict(self, data: dict):
        """Update all fields from a dictionary. Emits change signals only for changed values."""
        b1 = data.get("b1", {})

        self._timestamp = data.get("timestamp", time.time())
        self.timestampChanged.emit()

        # Connection
        new_connected = data.get("connected", self._connected)
        if new_connected != self._connected:
            self._connected = new_connected
            self.connectedChanged.emit()

        # B1
        self._set_if_changed("_b1_voltage", b1.get("voltage", self._b1_voltage), self.b1VoltageChanged)
        self._set_if_changed("_b1_capacity", b1.get("capacity", self._b1_capacity), self.b1CapacityChanged)
        self._set_if_changed("_b1_current", b1.get("current", self._b1_current), self.b1CurrentChanged)
        self._set_if_changed("_b1_ac_present", b1.get("acPresent", self._b1_ac_present), self.b1AcPresentChanged)
        self._set_if_changed("_b1_charging", b1.get("charging", self._b1_charging), self.b1ChargingChanged)
        self._set_if_changed("_b1_temperature", b1.get("temperature", self._b1_temperature), self.b1TemperatureChanged)
        self._set_if_changed("_b1_runtime", b1.get("runtime", self._b1_runtime), self.b1RuntimeChanged)

    def _set_if_changed(self, attr: str, value, signal: Signal):
        if getattr(self, attr) != value:
            setattr(self, attr, value)
            signal.emit()

    def to_dict(self) -> dict:
        """Serialize to dict matching the WebSocket JSON format."""
        return {
            "connected": self._connected,
            "timestamp": self._timestamp,
            "b1": {
                "voltage": self._b1_voltage,
                "capacity": self._b1_capacity,
                "current": self._b1_current,
                "acPresent": self._b1_ac_present,
                "charging": self._b1_charging,
                "temperature": self._b1_temperature,
                "runtime": self._b1_runtime,
            },
            "rawLines": [],
        }
