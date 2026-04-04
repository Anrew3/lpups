/**
 * network.ts — Key 3
 *
 * Toggles between WiFi-first and Cellular-first priority by adjusting
 * interface route metrics.  Both adapters remain active — only preference
 * changes.  The button shows the current active mode and toggles on press.
 *
 * Metrics used:
 *   WiFi-first:     WiFi=10,  Cellular=50
 *   Cellular-first: WiFi=100, Cellular=5
 */

import { action, SingletonAction, WillAppearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { makeButton, C } from "../render";

const execAsync = promisify(exec);
const SCRIPT = path.join(__dirname, "..", "..", "scripts", "network.ps1");

type NetMode = "WIFI" | "CELLULAR" | "UNKNOWN";

@action({ UUID: "com.lpups.casepanel.network" })
export class NetworkToggle extends SingletonAction {
  private mode: NetMode = "UNKNOWN";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active = new Set<any>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    await this.queryAndRender();
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
  }

  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    const next: NetMode = this.mode === "WIFI" ? "CELLULAR" : "WIFI";
    await this.setMode(next);
  }

  private async queryAndRender(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Mode status`
      );
      this.mode = stdout.trim().toUpperCase() as NetMode;
    } catch {
      this.mode = "UNKNOWN";
    }
    await this.renderAll();
  }

  private async setMode(mode: NetMode): Promise<void> {
    // Show transitioning state
    for (const a of this.active) {
      await a.setImage(makeButton(C.GRAY, [
        { text: "NETWORK",    y: 22, size: 10, color: "#cccccc", bold: false },
        { text: "SWITCHING", y: 42, size: 13 },
        { text: "...",        y: 58, size: 13 },
      ]));
    }

    try {
      await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Mode ${mode.toLowerCase()}`
      );
      this.mode = mode;
    } catch {
      this.mode = "UNKNOWN";
    }
    await this.renderAll();
  }

  private async renderAll(): Promise<void> {
    for (const a of this.active) await this.renderTo(a);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    const isCell  = this.mode === "CELLULAR";
    const isWifi  = this.mode === "WIFI";
    const bg      = isCell ? C.PURPLE : isWifi ? C.TEAL : C.GRAY;
    const icon    = isCell ? "▲ CELL" : isWifi ? "▲ WIFI" : "? NET";
    const sub     = isCell ? "WiFi standby" : isWifi ? "Cell standby" : "unknown";
    const tapHint = isCell ? "tap→WIFI" : "tap→CELL";

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "NETWORK",  y: 14, size: 10, color: "#cccccc", bold: false },
      { text: icon,       y: 35, size: 17 },
      { text: sub,        y: 51, size: 10, color: "#aaaaaa", bold: false },
      { text: tapHint,    y: 65, size: 10, color: "#dddddd", bold: false },
    ]));
  }
}
