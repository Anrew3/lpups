"""
system_commands.py
System control actions exposed to QML: shutdown, restart, network toggle.
"""

import subprocess
import logging
import os

from PySide6.QtCore import QObject, Signal, Slot, Property, QThread

log = logging.getLogger("system")

SCRIPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts")


class _NetworkWorker(QThread):
    """Runs network PowerShell commands off the main thread."""
    finished = Signal(str)  # result: "WIFI", "CELLULAR", "UNKNOWN", or "ERROR:..."

    def __init__(self, mode: str, parent=None):
        super().__init__(parent)
        self._mode = mode

    def run(self):
        script = os.path.join(SCRIPTS_DIR, "network.ps1")
        if not os.path.exists(script):
            self.finished.emit("ERROR:network.ps1 not found")
            return
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
                 "-File", script, "-Mode", self._mode],
                capture_output=True, text=True, timeout=30,
            )
            out = result.stdout.strip().upper()
            self.finished.emit(out if out in ("WIFI", "CELLULAR") else "UNKNOWN")
        except subprocess.TimeoutExpired:
            self.finished.emit("ERROR:timeout")
        except Exception as e:
            self.finished.emit(f"ERROR:{e}")


class SystemCommands(QObject):
    """Exposes system actions to QML."""

    networkModeChanged = Signal(str)
    networkSwitching = Signal(bool)
    shutdownStarted = Signal()
    restartStarted = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._network_mode = "UNKNOWN"
        self._switching = False
        self._worker = None

    @Property(str, notify=networkModeChanged)
    def networkMode(self):
        return self._network_mode

    @Slot()
    def shutdown(self):
        """Initiate system shutdown with 30s delay."""
        log.info("Shutdown requested")
        try:
            subprocess.Popen(
                ["shutdown", "/s", "/t", "30", "/c", "LPUPS: user shutdown"],
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self.shutdownStarted.emit()
        except Exception as e:
            log.error(f"Shutdown failed: {e}")

    @Slot()
    def restart(self):
        """Initiate system restart with 10s delay."""
        log.info("Restart requested")
        try:
            subprocess.Popen(
                ["shutdown", "/r", "/t", "10", "/c", "LPUPS: user restart"],
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            self.restartStarted.emit()
        except Exception as e:
            log.error(f"Restart failed: {e}")

    @Slot()
    def cancelShutdown(self):
        """Cancel a pending shutdown."""
        try:
            subprocess.Popen(
                ["shutdown", "/a"],
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
        except Exception as e:
            log.error(f"Cancel shutdown failed: {e}")

    @Slot()
    def queryNetwork(self):
        """Query current network mode (async)."""
        self._run_network_cmd("status")

    @Slot(str)
    def setNetwork(self, target: str):
        """Switch to WiFi or Cellular (async)."""
        if self._switching:
            return
        self._run_network_cmd(target.lower())

    def _run_network_cmd(self, mode: str):
        self._switching = True
        self.networkSwitching.emit(True)
        self._worker = _NetworkWorker(mode)
        self._worker.finished.connect(self._on_network_result)
        self._worker.start()

    def _on_network_result(self, result: str):
        self._switching = False
        self.networkSwitching.emit(False)
        if result.startswith("ERROR:"):
            log.error(f"Network command failed: {result}")
            self._network_mode = "UNKNOWN"
        else:
            self._network_mode = result
        self.networkModeChanged.emit(self._network_mode)
