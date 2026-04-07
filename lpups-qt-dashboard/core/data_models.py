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

    # B2
    b2PresentChanged = Signal()
    b2VoltageChanged = Signal()
    b2CurrentChanged = Signal()
    b2RemainingChanged = Signal()
    b2ChargingChanged = Signal()
    b2PowerDrawWChanged = Signal()
    b2AvgCurrentMAChanged = Signal()
    b2RuntimeMinsChanged = Signal()

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

        # B2 fields
        self._b2_present = False
        self._b2_voltage = 0
        self._b2_current = 0
        self._b2_remaining = 0
        self._b2_charging = False
        self._b2_power_draw_w = 0
        self._b2_avg_current_ma = 0
        self._b2_runtime_mins = 0

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

    # ── B2 Properties ───────────────────────────────────────────────────

    @Property(bool, notify=b2PresentChanged)
    def b2Present(self):
        return self._b2_present

    @Property(int, notify=b2VoltageChanged)
    def b2Voltage(self):
        return self._b2_voltage

    @Property(int, notify=b2CurrentChanged)
    def b2Current(self):
        return self._b2_current

    @Property(int, notify=b2RemainingChanged)
    def b2Remaining(self):
        return self._b2_remaining

    @Property(bool, notify=b2ChargingChanged)
    def b2Charging(self):
        return self._b2_charging

    @Property(int, notify=b2PowerDrawWChanged)
    def b2PowerDrawW(self):
        return self._b2_power_draw_w

    @Property(int, notify=b2AvgCurrentMAChanged)
    def b2AvgCurrentMA(self):
        return self._b2_avg_current_ma

    @Property(int, notify=b2RuntimeMinsChanged)
    def b2RuntimeMins(self):
        return self._b2_runtime_mins

    # ── Computed properties for QML ─────────────────────────────────────

    @Property(str, notify=b1VoltageChanged)
    def b1VoltageStr(self):
        return f"{self._b1_voltage / 1000:.2f}V"

    @Property(str, notify=b2VoltageChanged)
    def b2VoltageStr(self):
        return f"{self._b2_voltage / 1000:.2f}V"

    @Property(str, notify=b1CurrentChanged)
    def b1CurrentStr(self):
        ma = self._b1_current
        if abs(ma) >= 1000:
            return f"{ma / 1000:.1f}A"
        return f"{ma}mA"

    @Property(str, notify=b2AvgCurrentMAChanged)
    def b2AvgCurrentStr(self):
        ma = self._b2_avg_current_ma
        if abs(ma) >= 1000:
            return f"{ma / 1000:.1f}A"
        return f"{ma}mA"

    @Property(str, notify=b2RuntimeMinsChanged)
    def b2RuntimeStr(self):
        m = self._b2_runtime_mins
        if m <= 0:
            return "--"
        if m >= 60:
            return f"{m // 60}h {m % 60}m"
        return f"{m}m"

    @Property(str, notify=b1CurrentChanged)
    def b1CurrentDirection(self):
        if self._b1_current > 0:
            return "Charging"
        elif self._b1_current < 0:
            return "Discharging"
        return "Idle"

    # ── Bulk update (called from serial reader thread via signal) ──────

    @Slot("QVariant")
    def updateFromDict(self, data: dict):
        """Update all fields from a dictionary. Emits change signals only for changed values."""
        b1 = data.get("b1", {})
        b2 = data.get("b2", {})

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

        # B2
        self._set_if_changed("_b2_present", b2.get("present", self._b2_present), self.b2PresentChanged)
        self._set_if_changed("_b2_voltage", b2.get("voltage", self._b2_voltage), self.b2VoltageChanged)
        self._set_if_changed("_b2_current", b2.get("current", self._b2_current), self.b2CurrentChanged)
        self._set_if_changed("_b2_remaining", b2.get("remaining", self._b2_remaining), self.b2RemainingChanged)
        self._set_if_changed("_b2_charging", b2.get("charging", self._b2_charging), self.b2ChargingChanged)
        self._set_if_changed("_b2_power_draw_w", b2.get("powerDrawW", self._b2_power_draw_w), self.b2PowerDrawWChanged)
        self._set_if_changed("_b2_avg_current_ma", b2.get("avgCurrentMA", self._b2_avg_current_ma), self.b2AvgCurrentMAChanged)
        self._set_if_changed("_b2_runtime_mins", b2.get("runtimeMins", self._b2_runtime_mins), self.b2RuntimeMinsChanged)

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
            },
            "b2": {
                "present": self._b2_present,
                "voltage": self._b2_voltage,
                "current": self._b2_current,
                "remaining": self._b2_remaining,
                "charging": self._b2_charging,
                "powerDrawW": self._b2_power_draw_w,
                "avgCurrentMA": self._b2_avg_current_ma,
                "runtimeMins": self._b2_runtime_mins,
            },
            "rawLines": [],
        }
