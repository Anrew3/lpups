/**
 * main.ts — Electron main process
 *
 * Responsibilities:
 *  - Create BrowserWindow (kiosk-friendly, 1024×600 for 7" panel)
 *  - Start SerialReader → parse Arduino data
 *  - Start WSBroadcaster → share data with Stream Deck plugin on :8766
 *  - Forward serial events to renderer via IPC
 *  - Handle IPC calls from renderer: network, diagnostics, system control
 */

import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "path";
import { exec, spawn } from "child_process";
import * as readline from "readline";
import { SerialReader } from "./serial";
import { WSBroadcaster } from "./ws-server";
import type { DiagCheck, DiagResult } from "./types";

const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");
const IS_DEV = !app.isPackaged;

// ── Globals ──────────────────────────────────────────────────────────────────
const serial      = new SerialReader();
const broadcaster = new WSBroadcaster();
let   mainWin: BrowserWindow | null = null;

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow(): void {
  mainWin = new BrowserWindow({
    width:           1024,
    height:          600,
    fullscreen:      !IS_DEV,
    frame:           IS_DEV,
    autoHideMenuBar: true,
    backgroundColor: "#0d1117",
    webPreferences: {
      preload:          path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (IS_DEV) {
    mainWin.loadURL("http://localhost:5173");
    mainWin.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWin.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWin.on("closed", () => { mainWin = null; });
}

// ── Serial → IPC forwarding ───────────────────────────────────────────────────
function forwardSerial(): void {
  serial.on("data",       (d) => mainWin?.webContents.send("ups:data",       d));
  serial.on("event",      (m) => mainWin?.webContents.send("ups:event",      m));
  serial.on("connect",    (p) => mainWin?.webContents.send("ups:connect",    p));
  serial.on("disconnect", ()  => mainWin?.webContents.send("ups:disconnect"));
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

// Current UPS state snapshot
ipcMain.handle("ups:getState", () => serial.getState());

// Network mode query / set
ipcMain.handle("net:get", () => runPS(["status"]));
ipcMain.handle("net:set", (_ev, mode: string) => runPS([mode]));

function runPS(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", path.join(SCRIPTS_DIR, "network.ps1"),
      "-Mode", args[0],
    ], { windowsHide: true });

    let out = "";
    ps.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    ps.on("exit", () => {
      const result = out.trim().toUpperCase();
      resolve(result.startsWith("ERROR") ? "ERROR" : result);
    });
  });
}

// Diagnostics — streaming
ipcMain.on("diag:run", () => {
  const stateFile = path.join(app.getPath("temp"), "lpups-state.json");
  const outFile   = path.join(app.getPath("temp"), "lpups-diagnostics.txt");

  // Write current state JSON for the script to read
  try {
    const state  = serial.getState();
    const fs     = require("fs") as typeof import("fs");
    fs.writeFileSync(stateFile, JSON.stringify({
      connected:  state.connected,
      b1Capacity: state.b1.capacity,
      b2Present:  state.b2.present,
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
    // Each line: CHECK:PASS|WARN|FAIL:Name:Detail
    if (raw.startsWith("CHECK:")) {
      const parts = raw.split(":").slice(1);   // [status, name, detail...]
      const status = parts[0].toUpperCase() as DiagCheck["status"];
      const name   = parts[1] ?? "";
      const detail = parts.slice(2).join(":"); // detail may contain ":"
      const check: DiagCheck = { status, name, detail };
      checks.push(check);
      if (status === "PASS") pass++;
      else if (status === "WARN") warn++;
      else if (status === "FAIL") fail++;
      mainWin?.webContents.send("diag:check", check);
    }
  });

  ps.on("exit", () => {
    const result: DiagResult = {
      checks,
      pass, warn, fail,
      running:   false,
      startedAt: Date.now(),
    };
    mainWin?.webContents.send("diag:done", result);
  });
});

// System control
ipcMain.on("sys:shutdown", () => {
  exec(`shutdown /s /t 30 /c "LPUPS dashboard: user-initiated shutdown"`);
});
ipcMain.on("sys:restart",  () => {
  exec(`shutdown /r /t 10 /c "LPUPS dashboard: user-initiated restart"`);
});

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
