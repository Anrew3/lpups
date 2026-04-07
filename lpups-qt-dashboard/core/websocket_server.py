"""
websocket_server.py
Broadcasts UPS data to connected clients (Stream Deck plugin)
on ws://localhost:8766, matching the existing Electron format.
"""

import json
import asyncio
import logging
import threading
from typing import Any

import websockets
from websockets.server import serve

log = logging.getLogger("ws")

PORT = 8766


class WSBroadcaster:
    """WebSocket broadcaster running in a dedicated thread."""

    def __init__(self):
        self._clients: set = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._current_state: dict = {}

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True, name="ws-broadcast")
        self._thread.start()

    def stop(self):
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)

    def broadcast(self, msg_type: str, payload: Any):
        """Thread-safe broadcast from the Qt main thread."""
        if msg_type == "data":
            self._current_state = payload
        msg = json.dumps({"type": msg_type, "payload": payload})
        if self._loop and self._loop.is_running():
            self._loop.call_soon_threadsafe(
                asyncio.ensure_future,
                self._send_all(msg),
            )

    async def _send_all(self, msg: str):
        dead = set()
        for ws in self._clients:
            try:
                await ws.send(msg)
            except Exception:
                dead.add(ws)
        self._clients -= dead

    def _run(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._serve())

    async def _serve(self):
        try:
            async with serve(self._on_connect, "localhost", PORT):
                log.info(f"WebSocket server on ws://localhost:{PORT}")
                await asyncio.Future()  # run forever
        except OSError as e:
            log.error(f"WebSocket server failed: {e}")

    async def _on_connect(self, ws):
        self._clients.add(ws)
        log.info(f"Client connected ({len(self._clients)} total)")
        # Send current state immediately
        if self._current_state:
            try:
                await ws.send(json.dumps({"type": "data", "payload": self._current_state}))
            except Exception:
                pass
        try:
            async for _ in ws:
                pass  # ignore incoming messages
        finally:
            self._clients.discard(ws)
            log.info(f"Client disconnected ({len(self._clients)} total)")
