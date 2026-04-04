/**
 * main.ts — Electron main process
 */

import { app, BrowserWindow, ipcMain, Tray } from "electron";
import * as path from "path";
import * as fs from "fs";
import { exec, spawn } from "child_process";
import * as readline from "readline";
import { SerialReader } from "./serial";
import { WSBroadcaster } from "./ws-server";
import { setupTray } from "./tray";
import type { DiagCheck, DiagResult } from "./types";

// Scripts live adjacent to the ASAR in packaged builds, in project root during dev
const SCRIPTS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "scripts")
  : path.join(app.getAppPath(), "scripts");

const IS_DEV = process.env.NODE_ENV === "development";

const serial      = new SerialReader(SCRIPTS_DIR);
const broadcaster = new WSBroadcaster();
let   mainWin: BrowserWindow | null = null;
let   tray:    Tray | null          = null;
let   isQuitting = false;

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
    show:            false,   // show after ready-to-show to prevent flash
    webPreferences: {
      preload:          path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Show only when fully rendered — prevents white flash on startup
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
ipcMain.handle("ups:getState",     ()                    => serial.getState());
ipcMain.handle("net:get",          ()                    => runPS("status"));
ipcMain.handle("net:set",          (_ev, mode: string)   => runPS(mode));
ipcMain.on("tray:show",  ()  => { mainWin?.show(); mainWin?.focus(); });
ipcMain.on("tray:hide",  ()  => mainWin?.hide());

function runPS(mode: string): Promise<string> {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass",
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
    "-NoProfile", "-ExecutionPolicy", "Bypass",
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
  serial.start();
  broadcaster.start(serial);
  forwardSerial();
  createWindow();
  tray = setupTray(() => mainWin);
});

app.on("before-quit", () => { isQuitting = true; });

app.on("window-all-closed", () => {
  // Do NOT quit — we live in the tray.
  // Only quit when the user explicitly chooses Quit from the tray menu.
});
