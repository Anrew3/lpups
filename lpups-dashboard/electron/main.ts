/**
 * main.ts — Electron main process
 */

import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { exec, spawn } from "child_process";
import * as readline from "readline";
import { SerialReader } from "./serial";
import { WSBroadcaster } from "./ws-server";
import type { DiagCheck, DiagResult } from "./types";

// app.getAppPath() = the project root (where package.json lives) — works in
// both electron-vite preview and a packaged app.
const SCRIPTS_DIR = path.join(app.getAppPath(), "scripts");
const IS_DEV      = process.env.NODE_ENV === "development";

const serial      = new SerialReader(SCRIPTS_DIR);
const broadcaster = new WSBroadcaster();
let   mainWin: BrowserWindow | null = null;

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWin = new BrowserWindow({
    width:           1024,
    height:          600,
    fullscreen:      !IS_DEV,
    frame:           IS_DEV,
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    webPreferences: {
      // Preload is always at out/preload/preload.js relative to out/main/index.js
      preload:          path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (IS_DEV) {
    mainWin.loadURL("http://localhost:5173");
    mainWin.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWin.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWin.on("closed", () => { mainWin = null; });
}

// ── Serial → IPC forwarding ───────────────────────────────────────────────────
function forwardSerial(): void {
  serial.on("data",       (d) => mainWin?.webContents.send("ups:data",    d));
  serial.on("event",      (m) => mainWin?.webContents.send("ups:event",   m));
  serial.on("connect",    (p) => mainWin?.webContents.send("ups:connect", p));
  serial.on("disconnect", ()  => mainWin?.webContents.send("ups:disconnect"));
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle("ups:getState", () => serial.getState());

ipcMain.handle("net:get",          ()             => runPS("status"));
ipcMain.handle("net:set", (_ev, mode: string)     => runPS(mode));

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
    const result: DiagResult = { checks, pass, warn, fail, running: false, startedAt: Date.now() };
    mainWin?.webContents.send("diag:done", result);
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
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  serial.stop();
  broadcaster.stop();
  if (process.platform !== "darwin") app.quit();
});
