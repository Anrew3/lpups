"""
LPUPS Qt Dashboard
Lightweight PySide6 + QML dashboard for the DFRobot LPUPS.
Reads Arduino serial directly via pyserial, broadcasts via WebSocket.

Usage:
    python main.py              # fullscreen (production)
    python main.py --dev        # windowed with console
    python main.py --port COM9  # force specific COM port
"""

import sys
import os
import signal
import logging
import argparse

from PySide6.QtCore import QUrl, QTimer
from PySide6.QtGui import QGuiApplication, QIcon
from PySide6.QtQml import QQmlApplicationEngine

from core.data_models import UPSDataModel
from core.serial_reader import SerialReaderThread
from core.websocket_server import WSBroadcaster
from core.system_commands import SystemCommands
from core.event_log import EventLogModel
from core.power_history import PowerHistoryModel

# ── Logging ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("main")


def main():
    parser = argparse.ArgumentParser(description="LPUPS Dashboard")
    parser.add_argument("--dev", action="store_true", help="Windowed dev mode")
    parser.add_argument("--port", default="AUTO", help="COM port override")
    args = parser.parse_args()

    # ── Qt Application ──────────────────────────────────────────────────
    app = QGuiApplication(sys.argv)
    app.setApplicationName("LPUPS Dashboard")
    app.setOrganizationName("LPUPS")
    app.setApplicationVersion("2.0.0")

    # Allow Ctrl+C
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    # ── Data models ─────────────────────────────────────────────────────
    ups_data = UPSDataModel()
    event_log = EventLogModel()
    power_history = PowerHistoryModel()
    system_ctl = SystemCommands()

    # ── Serial reader ───────────────────────────────────────────────────
    serial_reader = SerialReaderThread(port_override=args.port)

    def on_serial_data(data: dict):
        ups_data.updateFromDict(data)
        # Add power draw to history
        b2_draw = data.get("b2", {}).get("powerDrawW", 0)
        power_history.addPoint(float(b2_draw))
        # Broadcast to Stream Deck
        ws_server.broadcast("data", ups_data.to_dict())

    def on_serial_event(msg: str):
        event_log.addEvent(msg)
        ws_server.broadcast("event", msg)

    def on_serial_connected(port: str):
        ups_data.serialPort = port
        ups_data.connected = True
        ups_data.lastError = ""
        ws_server.broadcast("connect", port)
        log.info(f"Arduino connected on {port}")

    def on_serial_disconnected():
        ups_data.connected = False
        ws_server.broadcast("disconnect", None)
        log.info("Arduino disconnected")

    def on_serial_error(err: str):
        ups_data.lastError = err
        log.error(f"Serial error: {err}")

    serial_reader.data_updated.connect(on_serial_data)
    serial_reader.event_received.connect(on_serial_event)
    serial_reader.connected.connect(on_serial_connected)
    serial_reader.disconnected.connect(on_serial_disconnected)
    serial_reader.error_occurred.connect(on_serial_error)

    # ── WebSocket server ────────────────────────────────────────────────
    ws_server = WSBroadcaster()
    ws_server.start()

    # ── QML engine ──────────────────────────────────────────────────────
    engine = QQmlApplicationEngine()

    # Expose models to QML
    ctx = engine.rootContext()
    ctx.setContextProperty("upsData", ups_data)
    ctx.setContextProperty("eventLog", event_log)
    ctx.setContextProperty("powerHistory", power_history)
    ctx.setContextProperty("systemCtl", system_ctl)
    ctx.setContextProperty("isDev", args.dev)

    # Load QML
    qml_dir = os.path.join(os.path.dirname(__file__), "qml")
    engine.addImportPath(qml_dir)
    engine.load(QUrl.fromLocalFile(os.path.join(qml_dir, "main.qml")))

    if not engine.rootObjects():
        log.error("Failed to load QML — check for syntax errors")
        sys.exit(1)

    # ── Start serial reader ─────────────────────────────────────────────
    serial_reader.start()

    # Query network status on startup
    QTimer.singleShot(2000, system_ctl.queryNetwork)

    # ── Run ─────────────────────────────────────────────────────────────
    log.info("Dashboard started" + (" (dev mode)" if args.dev else " (fullscreen)"))
    exit_code = app.exec()

    # ── Cleanup ─────────────────────────────────────────────────────────
    log.info("Shutting down...")
    serial_reader.stop()
    ws_server.stop()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
