/**
 * main.ts — Electron main process
 *
 * Security posture:
 *  - contextIsolation: true, nodeIntegration: false (renderer has no Node access)
 *  - CSP blocks all external network requests from the renderer
 *  - Navigation and new-window creation are blocked
 *  - Permission requests (camera, mic, etc.) are all denied
 *  - Only localhost WebSocket traffic is permitted
 */

import { app, BrowserWindow, ipcMain, Tray, session } from "electron";
import * as path from "path";
import * as fs from "fs";
import { exec, spawn } from "child_process";
import * as readline from "readline";
import { SerialReader }  from "./serial";
import { WSBroadcaster } from "./ws-server";
import { setupTray }     from "./tray";
import type { DiagCheck, DiagResult } from "./types";

// Disable hardware acceleration — we're a system panel, not a game
app.disableHardwareAcceleration();

// Scripts: adjacent to ASAR in packaged builds, project root in dev
const SCRIPTS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "scripts")
  : path.join(app.getAppPath(), "scripts");

const IS_DEV = process.env.NODE_ENV === "development";

const serial      = new SerialReader(SCRIPTS_DIR);
const broadcaster = new WSBroadcaster();
let   mainWin:    BrowserWindow | null = null;
let   tray:       Tray | null          = null;
let   isQuitting  = false;

// ── Content Security Policy ───────────────────────────────────────────────────
// Applied before any window is created. Blocks ALL external network requests.
// Only allows: local file resources, inline styles (Tailwind), data URIs,
// and localhost WebSocket (ws-server on :8766).
function applyCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",   // Tailwind uses inline styles
            "img-src 'self' data:",                // data: for SVG data URIs
            "font-src 'self'",                     // no Google Fonts
            "connect-src 'self' ws://localhost:8766", // only local WebSocket
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
          ].join("; "),
        ],
      },
    });
  });

  // Deny all permission requests (camera, mic, notifications, etc.)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false);
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWin = new BrowserWindow({
    width:           1024,
    height:          600,
    minWidth:        800,
    minHeight:       480,
    fullscreen:      !IS_DEV,
    frame:           IS_DEV,
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    show:            false,
    webPreferences: {
      preload:                    path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation:           true,
      nodeIntegration:            false,
      webSecurity:                true,
      allowRunningInsecureContent: false,
      experimentalFeatures:       false,
    },
  });

  // Block ALL external navigation
  mainWin.webContents.on("will-navigate", (event, url) => {
    const allowed = IS_DEV
      ? ["http://localhost:5173", "file://"]
      : ["file://"];
    const ok = allowed.some((prefix) => url.startsWith(prefix));
    if (!ok) {
      event.preventDefault();
      console.warn("[security] Blocked navigation to:", url);
    }
  });

  // Block new windows entirely
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    console.warn("[security] Blocked window open:", url);
    return { action: "deny" };
  });

  mainWin.once("ready-to-show", () => mainWin?.show());

  if (IS_DEV) {
    mainWin.loadURL("http://localhost:5173");
    mainWin.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // Hide to tray instead of quitting
  mainWin.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWin?.hide();
    }
  });
}

// ── Serial → IPC ──────────────────────────────────────────────────────────────
function forwardSerial(): void {
  serial.on("data",       (d) => mainWin?.webContents.send("ups:data",    d));
  serial.on("event",      (m) => mainWin?.webContents.send("ups:event",   m));
  serial.on("connect",    (p) => mainWin?.webContents.send("ups:connect", p));
  serial.on("disconnect", ()  => mainWin?.webContents.send("ups:disconnect"));
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("ups:getState",    ()                  => serial.getState());
ipcMain.handle("net:get",         ()                  => runPS("status"));
ipcMain.handle("net:set", (_ev, mode: string)         => runPS(mode));
ipcMain.on("tray:show",  ()  => { mainWin?.show(); mainWin?.focus(); });
ipcMain.on("tray:hide",  ()  => mainWin?.hide());

function runPS(mode: string): Promise<string> {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(SCRIPTS_DIR, "network.ps1"),
      "-Mode", mode,
    ], { windowsHide: true });
    let out = "";
    ps.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("exit", () => {
      const r = out.trim().toUpperCase();
      resolve(r.startsWith("ERROR") ? "ERROR" : r);
    });
  });
}

ipcMain.on("diag:run", () => {
  const stateFile = path.join(app.getPath("temp"), "lpups-state.json");
  const outFile   = path.join(app.getPath("temp"), "lpups-diagnostics.txt");

  try {
    const s = serial.getState();
    fs.writeFileSync(stateFile, JSON.stringify({
      connected:  s.connected,
      b1Capacity: s.b1.capacity,
      b2Present:  s.b2.present,
    }));
  } catch {}

  const checks: DiagCheck[] = [];
  let pass = 0, warn = 0, fail = 0;

  const ps = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", path.join(SCRIPTS_DIR, "diagnostics-stream.ps1"),
    "-StateFile", stateFile,
    "-OutFile",   outFile,
  ], { windowsHide: true });

  const rl = readline.createInterface({ input: ps.stdout! });
  rl.on("line", (raw) => {
    if (!raw.startsWith("CHECK:")) return;
    const parts  = raw.split(":").slice(1);
    const status = parts[0].toUpperCase() as DiagCheck["status"];
    const name   = parts[1] ?? "";
    const detail = parts.slice(2).join(":");
    const check: DiagCheck = { status, name, detail };
    checks.push(check);
    if (status === "PASS") pass++;
    else if (status === "WARN") warn++;
    else if (status === "FAIL") fail++;
    mainWin?.webContents.send("diag:check", check);
  });

  ps.on("exit", () => {
    mainWin?.webContents.send("diag:done", {
      checks, pass, warn, fail, running: false, startedAt: Date.now(),
    } as DiagResult);
  });
});

ipcMain.on("sys:shutdown", () => exec(`shutdown /s /t 30 /c "LPUPS: user shutdown"`));
ipcMain.on("sys:restart",  () => exec(`shutdown /r /t 10 /c "LPUPS: user restart"`));

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  applyCSP();
  serial.start();
  broadcaster.start(serial);
  forwardSerial();
  createWindow();
  tray = setupTray(() => mainWin);
});

app.on("before-quit", () => { isQuitting = true; });

app.on("window-all-closed", () => {
  // Stay alive in the tray — only Quit menu item exits the app
});
