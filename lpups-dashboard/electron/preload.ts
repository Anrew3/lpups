/**
 * preload.ts
 * Exposes a typed IPC API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { UPSData, DiagResult } from "./types";

contextBridge.exposeInMainWorld("lpups", {
  // ── UPS data ──────────────────────────────────────────────────────────
  onData(cb: (data: UPSData) => void): () => void {
    const handler = (_: unknown, d: UPSData) => cb(d);
    ipcRenderer.on("ups:data", handler);
    return () => ipcRenderer.removeListener("ups:data", handler);
  },

  onEvent(cb: (msg: string) => void): () => void {
    const handler = (_: unknown, m: string) => cb(m);
    ipcRenderer.on("ups:event", handler);
    return () => ipcRenderer.removeListener("ups:event", handler);
  },

  onConnect(cb: (port: string) => void): () => void {
    const handler = (_: unknown, p: string) => cb(p);
    ipcRenderer.on("ups:connect", handler);
    return () => ipcRenderer.removeListener("ups:connect", handler);
  },

  onDisconnect(cb: () => void): () => void {
    const handler = () => cb();
    ipcRenderer.on("ups:disconnect", handler);
    return () => ipcRenderer.removeListener("ups:disconnect", handler);
  },

  getState(): Promise<UPSData> {
    return ipcRenderer.invoke("ups:getState");
  },

  // ── Network control ───────────────────────────────────────────────────
  getNetwork(): Promise<"WIFI" | "CELLULAR" | "ERROR"> {
    return ipcRenderer.invoke("net:get");
  },

  setNetwork(mode: "wifi" | "cellular"): Promise<"WIFI" | "CELLULAR" | "ERROR"> {
    return ipcRenderer.invoke("net:set", mode);
  },

  // ── Diagnostics ───────────────────────────────────────────────────────
  onDiagCheck(cb: (check: { status: string; name: string; detail: string }) => void): () => void {
    const handler = (_: unknown, c: { status: string; name: string; detail: string }) => cb(c);
    ipcRenderer.on("diag:check", handler);
    return () => ipcRenderer.removeListener("diag:check", handler);
  },

  onDiagDone(cb: (result: DiagResult) => void): () => void {
    const handler = (_: unknown, r: DiagResult) => cb(r);
    ipcRenderer.on("diag:done", handler);
    return () => ipcRenderer.removeListener("diag:done", handler);
  },

  runDiagnostics(): void {
    ipcRenderer.send("diag:run");
  },

  // ── System control ────────────────────────────────────────────────────
  shutdown(): void {
    ipcRenderer.send("sys:shutdown");
  },

  restart(): void {
    ipcRenderer.send("sys:restart");
  },
});

// Make types available in renderer without importing Electron
export type {};
