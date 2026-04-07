import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import {
  createCanvas, text, drawPowerBtnIcon, drawAlertIcon, drawDivider,
  cachedImage, setImageIfChanged, C,
} from "../render";

type State = "IDLE" | "CONFIRM" | "EXECUTING";

@action({ UUID: "com.lpups.casepanel.system" })
export class SystemControl extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active       = new Set<any>();
  private state: State = "IDLE";
  private pressStart   = 0;
  private confirmTimer?: NodeJS.Timeout;
  private uptimeTimer?: NodeJS.Timeout;
  private uptimeStr    = "";

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    await this.fetchUptime();
    await this.renderAll();
    // Clear any existing timer before starting a new one (prevents accumulation)
    if (this.uptimeTimer) clearInterval(this.uptimeTimer);
    this.uptimeTimer = setInterval(async () => {
      await this.fetchUptime();
      if (this.state === "IDLE") await this.renderAll();
    }, 60_000);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      if (this.uptimeTimer) { clearInterval(this.uptimeTimer); this.uptimeTimer = undefined; }
      if (this.confirmTimer) { clearTimeout(this.confirmTimer); this.confirmTimer = undefined; }
    }
  }

  override onKeyDown(_ev: KeyDownEvent): void { this.pressStart = Date.now(); }

  override async onKeyUp(_ev: KeyUpEvent): Promise<void> {
    const held = Date.now() - this.pressStart;
    if (held >= 2500) {
      await this.execute("restart");
    } else if (this.state === "IDLE") {
      this.state = "CONFIRM";
      await this.renderAll();
      this.confirmTimer = setTimeout(async () => { this.state = "IDLE"; await this.renderAll(); }, 4000);
    } else if (this.state === "CONFIRM") {
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      await this.execute("shutdown");
    }
  }

  private async execute(cmd: "shutdown" | "restart"): Promise<void> {
    this.state = "EXECUTING";
    await this.renderAll();
    exec(cmd === "shutdown"
      ? `shutdown /s /t 30 /c "LPUPS panel shutdown"`
      : `shutdown /r /t 10 /c "LPUPS panel restart"`);
  }

  private async fetchUptime(): Promise<void> {
    return new Promise(resolve => {
      exec(`powershell -NoProfile -Command "(Get-Date)-(gcim Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalSeconds"`,
        (err, stdout) => {
          if (!err) {
            const secs = parseFloat(stdout.trim());
            if (!isNaN(secs)) {
              const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
              this.uptimeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }
          }
          resolve();
        });
    });
  }

  private async renderAll(): Promise<void> { for (const a of this.active) await this.renderTo(a); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    try {
      // ── EXECUTING state ──
      if (this.state === "EXECUTING") {
        return void await setImageIfChanged(a, await cachedImage("sys|exec", () => {
          const px = createCanvas(C.RED);
          drawAlertIcon(px, 36, 3, "#ffaaaa");
          text(px, "SENDING", 36, 30, 1, "#ffffff", true);
          text(px, "CMD...", 36, 48, 2);
          return px;
        }));
      }

      // ── CONFIRM state ──
      if (this.state === "CONFIRM") {
        return void await setImageIfChanged(a, await cachedImage("sys|confirm", () => {
          const px = createCanvas(C.ORANGE);
          drawAlertIcon(px, 36, 2, "#ffdd44");
          text(px, "SHUTDOWN?", 36, 26, 1, "#ffffff", true);
          text(px, "TAP TO", 36, 44, 2);
          text(px, "CONFIRM", 36, 56, 1, "#ffffff", true);
          text(px, "4s cancel", 36, 68, 1, "#dddddd", false);
          return px;
        }));
      }

      // ── IDLE state ──
      const key = `sys|idle|${this.uptimeStr}`;
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(C.DKGRAY);

        // Power button icon
        drawPowerBtnIcon(px, 36, 3, "#aaaaaa");

        // Uptime value (scale 2 = bold)
        text(px, this.uptimeStr || "...", 36, 30, 2);

        // "uptime" label
        text(px, "uptime", 36, 41, 1, "#888888", false);

        // Divider
        drawDivider(px, 44);

        // Action hints
        text(px, "TAP=OFF", 36, 55, 1, "#ffaaaa", true);
        text(px, "HOLD=RST", 36, 66, 1, "#aaaaff", false);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[system] render error: ${err}`);
    }
  }
}
