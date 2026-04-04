# LPUPS Case Panel — Stream Deck Plugin

## Requirements (on the LattePanda)
- Node.js 20 LTS  (download from nodejs.org)
- Stream Deck software 6.4 or later
- Arduino sketch flashed and Arduino connected via USB

## Build (do this on the LattePanda or cross-compile on Mac)

```cmd
cd com.lpups.casepanel.sdPlugin
npm install
npm run build
```

This produces `bin/plugin.js` — the single bundled plugin file.

## Install

Copy the entire `com.lpups.casepanel.sdPlugin` folder to:

```
C:\Users\LattePanda\AppData\Roaming\Elgato\StreamDeck\Plugins\
```

Restart Stream Deck software.  The six actions will appear under the
category "LPUPS" in the action list.  Drag each to a key.

## Key layout (recommended)

```
┌─────────────┬─────────────┬─────────────┐
│  Battery    │   Power /   │   Network   │
│  Status     │   Runtime   │   Toggle    │
├─────────────┼─────────────┼─────────────┤
│  UPS        │   System    │   Get Help  │
│  Events     │   Control   │ Diagnostics │
└─────────────┴─────────────┴─────────────┘
```

## Network toggle note

The script uses interface metrics, not disable/enable.  Both adapters
stay connected — only routing preference changes.
  - WiFi-first:     Wi-Fi metric=10,  Cellular metric=50
  - Cellular-first: Wi-Fi metric=100, Cellular metric=5

Run Stream Deck software as Administrator the first time to allow the
Set-NetIPInterface PowerShell call to succeed.

## Placeholder icons

The `imgs/` folder needs PNG files with these names (72×72 or 144×144):
  plugin, category, act-battery, act-power, act-network,
  act-events, act-system, act-diag

Simple colored squares work fine until proper icons are designed.
