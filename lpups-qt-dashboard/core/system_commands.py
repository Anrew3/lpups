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


class _AutoConnectWorker(QThread):
    """Runs auto-connect.ps1 off the main thread."""
    finished = Signal(str, str)   # (result_type, ssid)
    progress = Signal(str)        # info lines for status display

    def __init__(self, mode: str = "auto", parent=None):
        super().__init__(parent)
        self._mode = mode

    def run(self):
        script = os.path.join(SCRIPTS_DIR, "auto-connect.ps1")
        if not os.path.exists(script):
            self.finished.emit("error", "auto-connect.ps1 not found")
            return
        try:
            proc = subprocess.Popen(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
                 "-File", script, "-Mode", self._mode],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, bufsize=1,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            for line in proc.stdout:
                line = line.strip()
                if line.startswith("INFO:"):
                    self.progress.emit(line[5:])
                elif line.startswith("RESULT:WIFI_CONNECTED:"):
                    self.finished.emit("wifi", line[22:])
                    proc.wait()
                    return
                elif line.startswith("RESULT:WIFI_ALREADY:"):
                    self.finished.emit("wifi", line[20:])
                    proc.wait()
                    return
                elif line in ("RESULT:CELLULAR_FALLBACK", "RESULT:CELLULAR_ALREADY"):
                    self.finished.emit("cellular", "")
                    proc.wait()
                    return
                elif line == "RESULT:NO_CONNECTIVITY":
                    self.finished.emit("none", "")
                    proc.wait()
                    return

            proc.wait(timeout=60)
            self.finished.emit("none", "")
        except subprocess.TimeoutExpired:
            self.finished.emit("error", "timeout")
        except Exception as e:
            self.finished.emit("error", str(e))


class SystemCommands(QObject):
    """Exposes system actions to QML."""

    networkModeChanged = Signal(str)
    networkSwitching = Signal(bool)
    shutdownStarted = Signal()
    restartStarted = Signal()

    # Auto-connect signals
    autoConnectStarted = Signal()
    autoConnectProgress = Signal(str)    # status message
    autoConnectFinished = Signal(str, str)  # (type, ssid)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._network_mode = "UNKNOWN"
        self._switching = False
        self._worker = None
        self._ac_worker = None
        self._auto_connecting = False

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

    # ── Auto-connect ────────────────────────────────────────────────────

    @Property(bool, notify=autoConnectStarted)
    def autoConnecting(self):
        return self._auto_connecting

    @Slot()
    def autoConnect(self):
        """Auto-connect to best available network (WiFi then cellular)."""
        if self._auto_connecting:
            return
        self._auto_connecting = True
        self.autoConnectStarted.emit()
        log.info("Auto-connect started")

        self._ac_worker = _AutoConnectWorker("auto")
        self._ac_worker.progress.connect(self._on_ac_progress)
        self._ac_worker.finished.connect(self._on_ac_finished)
        self._ac_worker.start()

    @Slot()
    def scanNetworks(self):
        """Scan for available networks without connecting."""
        if self._auto_connecting:
            return
        self._auto_connecting = True
        self.autoConnectStarted.emit()

        self._ac_worker = _AutoConnectWorker("scan")
        self._ac_worker.progress.connect(self._on_ac_progress)
        self._ac_worker.finished.connect(self._on_ac_finished)
        self._ac_worker.start()

    def _on_ac_progress(self, msg: str):
        log.info(f"Auto-connect: {msg}")
        self.autoConnectProgress.emit(msg)

    def _on_ac_finished(self, result_type: str, ssid: str):
        self._auto_connecting = False
        log.info(f"Auto-connect result: {result_type} {ssid}")
        self.autoConnectFinished.emit(result_type, ssid)

        # Update network mode based on result
        if result_type == "wifi":
            self._network_mode = "WIFI"
        elif result_type == "cellular":
            self._network_mode = "CELLULAR"
        self.networkModeChanged.emit(self._network_mode)
