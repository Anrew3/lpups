/**
 * system.ts — Key 5
 *
 * Power control with two-step confirmation to prevent accidental triggers.
 *
 *   TAP  → Enters "CONFIRM SHUTDOWN?" state.
 *           Tap again within 4 s  → graceful shutdown (30s delay).
 *           No second tap → reverts to idle.
 *
 *   HOLD (≥ 2.5 s) → Immediate graceful restart (10 s delay).
 *
 * Idle display shows system uptime so you know at a glance how long the
 * LP has been running.
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { makeButton, C as RC } from "../render";

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
    // Refresh uptime every 60 s
    this.uptimeTimer = setInterval(async () => {
      await this.fetchUptime();
      if (this.state === "IDLE") await this.renderAll();
    }, 60_000);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0 && this.uptimeTimer) {
      clearInterval(this.uptimeTimer);
    }
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    this.pressStart = Date.now();
  }

  override async onKeyUp(_ev: KeyUpEvent): Promise<void> {
    const held = Date.now() - this.pressStart;

    if (held >= 2500) {
      // ── HOLD → Restart ──────────────────────────────────────────────────
      await this.execute("restart");
    } else {
      // ── TAP → Shutdown (two-step confirm) ───────────────────────────────
      if (this.state === "IDLE") {
        this.state = "CONFIRM";
        await this.renderAll();
        this.confirmTimer = setTimeout(async () => {
          this.state = "IDLE";
          await this.renderAll();
        }, 4000);

      } else if (this.state === "CONFIRM") {
        if (this.confirmTimer) clearTimeout(this.confirmTimer);
        await this.execute("shutdown");
      }
    }
  }

  private async execute(cmd: "shutdown" | "restart"): Promise<void> {
    this.state = "EXECUTING";
    await this.renderAll();

    if (cmd === "shutdown") {
      exec(`shutdown /s /t 30 /c "UPS panel: user-initiated shutdown"`);
    } else {
      exec(`shutdown /r /t 10 /c "UPS panel: user-initiated restart"`);
    }
  }

  private async fetchUptime(): Promise<void> {
    return new Promise(resolve => {
      exec(
        `powershell -NoProfile -Command "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalSeconds"`,
        (err, stdout) => {
          if (!err) {
            const secs = parseFloat(stdout.trim());
            if (!isNaN(secs)) {
              const h = Math.floor(secs / 3600);
              const m = Math.floor((secs % 3600) / 60);
              this.uptimeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            }
          }
          resolve();
        }
      );
    });
  }

  private async renderAll(): Promise<void> {
    for (const a of this.active) await this.renderTo(a);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    if (this.state === "EXECUTING") {
      await a.setImage(makeButton(C.RED, [
        { text: "SYSTEM",    y: 18, size: 11, color: "#cccccc", bold: false },
        { text: "SENDING",   y: 38, size: 14 },
        { text: "COMMAND...",y: 55, size: 11 },
      ]));
      return;
    }

    if (this.state === "CONFIRM") {
      await a.setImage(makeButton(C.ORANGE, [
        { text: "SHUTDOWN?",  y: 18, size: 14 },
        { text: "TAP TO",     y: 38, size: 13 },
        { text: "CONFIRM",    y: 55, size: 14 },
        { text: "(4s cancel)",y: 68, size: 9, color: "#dddddd", bold: false },
      ]));
      return;
    }

    // IDLE
    const uptime = this.uptimeStr || "...";
    await a.setImage(makeButton(C.DKGRAY, [
      { text: "SYSTEM",    y: 13, size: 10, color: "#999999", bold: false },
      { text: uptime,      y: 30, size: 15 },
      { text: "uptime",    y: 42, size: 9,  color: "#888888", bold: false },
      { text: "TAP=OFF",   y: 57, size: 11, color: "#ffaaaa" },
      { text: "HOLD=RST",  y: 69, size: 10, color: "#aaaaff", bold: false },
    ]));
  }
}

const C = RC;
