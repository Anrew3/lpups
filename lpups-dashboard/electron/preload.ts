import { contextBridge, ipcRenderer } from "electron";
import type { UPSData, DiagResult } from "./types";

contextBridge.exposeInMainWorld("lpups", {
  onData(cb: (data: UPSData) => void): () => void {
    const h = (_: unknown, d: UPSData) => cb(d);
    ipcRenderer.on("ups:data", h);
    return () => ipcRenderer.removeListener("ups:data", h);
  },
  onEvent(cb: (msg: string) => void): () => void {
    const h = (_: unknown, m: string) => cb(m);
    ipcRenderer.on("ups:event", h);
    return () => ipcRenderer.removeListener("ups:event", h);
  },
  onConnect(cb: (port: string) => void): () => void {
    const h = (_: unknown, p: string) => cb(p);
    ipcRenderer.on("ups:connect", h);
    return () => ipcRenderer.removeListener("ups:connect", h);
  },
  onDisconnect(cb: () => void): () => void {
    const h = () => cb();
    ipcRenderer.on("ups:disconnect", h);
    return () => ipcRenderer.removeListener("ups:disconnect", h);
  },
  getState(): Promise<UPSData> {
    return ipcRenderer.invoke("ups:getState");
  },
  getNetwork(): Promise<"WIFI" | "CELLULAR" | "ERROR"> {
    return ipcRenderer.invoke("net:get");
  },
  setNetwork(mode: "wifi" | "cellular"): Promise<"WIFI" | "CELLULAR" | "ERROR"> {
    return ipcRenderer.invoke("net:set", mode);
  },
  onDiagCheck(cb: (c: { status: string; name: string; detail: string }) => void): () => void {
    const h = (_: unknown, c: { status: string; name: string; detail: string }) => cb(c);
    ipcRenderer.on("diag:check", h);
    return () => ipcRenderer.removeListener("diag:check", h);
  },
  onDiagDone(cb: (r: DiagResult) => void): () => void {
    const h = (_: unknown, r: DiagResult) => cb(r);
    ipcRenderer.on("diag:done", h);
    return () => ipcRenderer.removeListener("diag:done", h);
  },
  runDiagnostics(): void { ipcRenderer.send("diag:run"); },
  shutdown():       void { ipcRenderer.send("sys:shutdown"); },
  restart():        void { ipcRenderer.send("sys:restart"); },
  showWindow():     void { ipcRenderer.send("tray:show"); },
  hideWindow():     void { ipcRenderer.send("tray:hide"); },
});

export type {};
