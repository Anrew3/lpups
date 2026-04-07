import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { makeButton, setImageIfChanged, C } from "../render";

const execAsync = promisify(exec);
const SCRIPT    = path.join(__dirname, "..", "scripts", "network.ps1");
type NetMode    = "WIFI" | "CELLULAR" | "UNKNOWN";

@action({ UUID: "com.lpups.casepanel.network" })
export class NetworkToggle extends SingletonAction {
  private mode:   NetMode = "UNKNOWN";
  private isSwitching = false;
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
    if (this.isSwitching) return;
    await this.setMode(this.mode === "WIFI" ? "CELLULAR" : "WIFI");
  }

  private async queryAndRender(): Promise<void> {
    try {
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Mode status`,
        { timeout: 15_000 },
      );
      this.mode = stdout.trim().toUpperCase() as NetMode;
    } catch { this.mode = "UNKNOWN"; }
    await this.renderAll();
  }

  private async setMode(mode: NetMode): Promise<void> {
    if (this.isSwitching) return;
    this.isSwitching = true;
    try {
      const switching = await makeButton(C.GRAY, [
        { text: "NETWORK",   y: 22, size: 10, color: "#cccccc", bold: false },
        { text: "SWITCHING", y: 42, size: 13 },
        { text: "...",       y: 58, size: 13 },
      ]);
      for (const a of this.active) await setImageIfChanged(a, switching);
      try {
        await execAsync(
          `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -Mode ${mode.toLowerCase()}`,
          { timeout: 30_000 },
        );
        this.mode = mode;
      } catch { this.mode = "UNKNOWN"; }
      await this.renderAll();
    } finally {
      this.isSwitching = false;
    }
  }

  private async renderAll(): Promise<void> {
    for (const a of this.active) await this.renderTo(a);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    try {
      const isCell = this.mode === "CELLULAR";
      const isWifi = this.mode === "WIFI";
      await a.setTitle("");
      await setImageIfChanged(a, await makeButton(
        isCell ? C.PURPLE : isWifi ? C.TEAL : C.GRAY, [
        { text: "NETWORK",                             y: 14, size: 10, color: "#cccccc", bold: false },
        { text: isCell ? "CELL" : isWifi ? "WIFI" : "?", y: 35, size: 19 },
        { text: isCell ? "WiFi standby" : isWifi ? "Cell standby" : "unknown", y: 51, size: 10, color: "#aaaaaa", bold: false },
        { text: isCell ? "tap->WIFI" : "tap->CELL",    y: 65, size: 10, color: "#dddddd", bold: false },
      ]));
    } catch (err) {
      streamDeck.logger.error(`[network] render error: ${err}`);
    }
  }
}
