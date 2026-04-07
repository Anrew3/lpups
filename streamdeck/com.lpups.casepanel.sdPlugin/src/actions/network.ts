import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import {
  createCanvas, text, drawWifiIcon, drawCellBarsIcon, drawXIcon, drawGearIcon,
  cachedImage, setImageIfChanged, C,
} from "../render";

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
      // Show switching indicator
      const switchImg = await cachedImage("net|switching", () => {
        const px = createCanvas(C.GRAY);
        drawGearIcon(px, 36, 10, "#aaaaaa");
        text(px, "NETWORK", 36, 32, 1, "#888888", false);
        text(px, "SWITCHING", 36, 46, 1, "#ffffff", true);
        text(px, "...", 36, 60, 1, "#888888", false);
        return px;
      });
      for (const a of this.active) await setImageIfChanged(a, switchImg);

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
      const bg     = isCell ? C.PURPLE : isWifi ? C.TEAL : C.GRAY;
      const key    = `net|${this.mode}`;

      await a.setTitle("");
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Mode icon
        if (isWifi)      drawWifiIcon(px, 36, 2, "#ffffff");
        else if (isCell) drawCellBarsIcon(px, 36, 2, 4, "#ffffff", "#555555");
        else             drawXIcon(px, 36, 5, "#888888");

        // Big mode label (scale 3)
        text(px, isCell ? "CELL" : isWifi ? "WIFI" : "???", 36, 38, 3);

        // Status info
        text(px, isCell ? "WiFi standby" : isWifi ? "Cell standby" : "unknown", 36, 50, 1, "#aaaaaa", false);

        // Action hint
        text(px, isCell ? "tap > WIFI" : "tap > CELL", 36, 64, 1, "#dddddd", false);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[network] render error: ${err}`);
    }
  }
}
