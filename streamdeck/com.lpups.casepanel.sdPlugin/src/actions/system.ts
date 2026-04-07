import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { makeButton, setImageIfChanged, C } from "../render";

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
      if (this.state === "EXECUTING") {
        return void await setImageIfChanged(a, await makeButton(C.RED, [
          { text: "SYSTEM",      y: 18, size: 11, color: "#cccccc", bold: false },
          { text: "SENDING",     y: 38, size: 14 },
          { text: "COMMAND...",  y: 55, size: 11 },
        ]));
      }
      if (this.state === "CONFIRM") {
        return void await setImageIfChanged(a, await makeButton(C.ORANGE, [
          { text: "SHUTDOWN?",   y: 18, size: 14 },
          { text: "TAP TO",      y: 38, size: 13 },
          { text: "CONFIRM",     y: 55, size: 14 },
          { text: "(4s cancel)", y: 68, size: 9, color: "#dddddd", bold: false },
        ]));
      }
      await setImageIfChanged(a, await makeButton(C.DKGRAY, [
        { text: "SYSTEM",                      y: 13, size: 10, color: "#999999", bold: false },
        { text: this.uptimeStr || "...",        y: 30, size: 15 },
        { text: "uptime",                      y: 42, size: 9,  color: "#888888", bold: false },
        { text: "TAP=OFF",                     y: 57, size: 11, color: "#ffaaaa" },
        { text: "HOLD=RST",                    y: 69, size: 10, color: "#aaaaff", bold: false },
      ]));
    } catch (err) {
      streamDeck.logger.error(`[system] render error: ${err}`);
    }
  }
}
