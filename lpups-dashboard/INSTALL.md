# LPUPS Dashboard — Electron App

Full-screen dashboard for the LattePanda's attached 7" display.
Acts as the **sole Arduino serial reader** and broadcasts data to the Stream Deck plugin via WebSocket on port 8766.

## Requirements

- Node.js 20 LTS
- Windows 10/11 (LattePanda)
- Arduino sketch flashed and USB connected

## Build

```cmd
cd lpups-dashboard
npm install
npm run build
```

## Run (dev)

```cmd
npm run dev
```

## Run (production — starts full-screen)

```cmd
npm start
```

## Auto-start on boot

Create a Task Scheduler entry or a startup shortcut pointing to:

```
node_modules\.bin\electron.cmd . --no-sandbox
```

Or package with `electron-builder` to create an installer.

## Architecture

```
Arduino (USB serial 115200)
    │
    ▼
Electron main process  ──── IPC ────► Renderer (React, 7" display)
    │
    └── WebSocket :8766 ─────────────► Stream Deck plugin (6 keys)
```

The Electron app owns the COM port exclusively.
The Stream Deck plugin connects as a WebSocket client — no port conflict.

## Display layout (1024×600)

```
┌─────────────────────────────────────────────────────────────┐
│  LPUPS                        [dashboard]  [diagnostics]    │
├──────────────────────────┬──────────────────────────────────┤
│   18650 UPS Pack         │   12V LiON Pack                  │
│   85%  ████████░░        │   73%  ███████░░░                │
│   Current: 450 mA ↓      │   Draw: 10 W / 820 mA avg        │
│   Temp: 28 °C            │   Runtime: 11h 40m               │
├───────────────┬──────────┴──────────────────────────────────┤
│ Network       │   Arduino Events                            │
│ WIFI          │   >>> B2 charger plugged in                 │
│ [→ Cellular]  │   >>> B2 charger unplugged                  │
├───────────────┤                                             │
│ System        │                                             │
│ [Shutdown]    │                                             │
│ [Restart]     │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

Tap **diagnostics** to run 15 system sanity checks with live streaming output.
