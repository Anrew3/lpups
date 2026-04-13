import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { serialReader } from "../serial-reader";
import {
  createCanvas, text, drawHealthIcon, drawCheckIcon, drawXIcon, drawGearIcon,
  drawWifiIcon, drawCellBarsIcon,
  cachedImage, setImageIfChanged, C,
} from "../render";

const execAsync       = promisify(exec);
const DIAG_SCRIPT     = path.join(__dirname, "..", "scripts", "diagnostics.ps1");
const CONNECT_SCRIPT  = path.join(__dirname, "..", "scripts", "auto-connect.ps1");
const RESULT_FILE     = path.join(os.tmpdir(), "lpups-diagnostics.txt");
const STATE_FILE      = path.join(os.tmpdir(), "lpups-serial-state.json");
type DiagState        = "IDLE" | "CONNECTING" | "RUNNING" | "DONE";
interface Summary      { pass: number; warn: number; fail: number; }
interface ConnResult   { type: "wifi" | "cellular" | "none"; ssid?: string; }
const SPIN            = ["|", "/", "-", "\\"];

@action({ UUID: "com.lpups.casepanel.diagnostics" })
export class Diagnostics extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active      = new Set<any>();
  private diagState: DiagState = "IDLE";
  private summary:    Summary | null = null;
  private connResult: ConnResult = { type: "none" };
  private pressStart  = 0;
  private spinTimer?: NodeJS.Timeout;
  private spinFrame   = 0;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    await this.renderAll();
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      if (this.spinTimer) { clearInterval(this.spinTimer); this.spinTimer = undefined; }
    }
  }

  override onKeyDown(_ev: KeyDownEvent): void { this.pressStart = Date.now(); }

  override async onKeyUp(_ev: KeyUpEvent): Promise<void> {
    const held = Date.now() - this.pressStart;
    if (held >= 2500) {
      // Long hold: run auto-connect only (skip diagnostics)
      await this.runAutoConnect(true);
    } else if (this.diagState === "IDLE") {
      // Tap from idle: auto-connect then diagnostics
      await this.runAutoConnect(false);
    } else if (this.diagState === "DONE" && existsSync(RESULT_FILE)) {
      exec(`notepad.exe "${RESULT_FILE}"`);
    }
  }

  // ── Auto-connect ─────────────────────────────────────────────────────

  private async runAutoConnect(connectOnly: boolean): Promise<void> {
    if (this.diagState === "CONNECTING" || this.diagState === "RUNNING") return;

    this.diagState = "CONNECTING";
    this.spinFrame = 0;
    this.connResult = { type: "none" };
    await this.renderAll();

    this.spinTimer = setInterval(async () => {
      this.spinFrame = (this.spinFrame + 1) % SPIN.length;
      await this.renderAll();
    }, 300);

    try {
      const scriptPath = CONNECT_SCRIPT;
      if (!existsSync(scriptPath)) {
        streamDeck.logger.error("[diagnostics] auto-connect.ps1 not found");
        this.connResult = { type: "none" };
      } else {
        const { stdout } = await execAsync(
          `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
          { timeout: 60_000 },
        );

        // Parse result line
        const lines = stdout.split("\n").map(l => l.trim());
        for (const line of lines) {
          if (line.startsWith("RESULT:WIFI_CONNECTED:")) {
            this.connResult = { type: "wifi", ssid: line.slice(22) };
          } else if (line.startsWith("RESULT:WIFI_ALREADY:")) {
            this.connResult = { type: "wifi", ssid: line.slice(20) };
          } else if (line === "RESULT:CELLULAR_FALLBACK" || line === "RESULT:CELLULAR_ALREADY") {
            this.connResult = { type: "cellular" };
          } else if (line === "RESULT:NO_CONNECTIVITY") {
            this.connResult = { type: "none" };
          }
        }
      }
    } catch (err) {
      streamDeck.logger.error(`[diagnostics] auto-connect failed: ${err}`);
      this.connResult = { type: "none" };
    }

    if (this.spinTimer) { clearInterval(this.spinTimer); this.spinTimer = undefined; }

    // If connect-only mode, show result and stop
    if (connectOnly) {
      this.diagState = "DONE";
      this.summary = this.connResult.type !== "none"
        ? { pass: 1, warn: 0, fail: 0 }
        : { pass: 0, warn: 0, fail: 1 };
      await this.renderAll();
      return;
    }

    // Otherwise continue to diagnostics
    await this.runDiagnostics();
  }

  // ── Diagnostics ──────────────────────────────────────────────────────

  private async runDiagnostics(): Promise<void> {
    this.diagState = "RUNNING";
    this.spinFrame = 0;
    await this.renderAll();

    this.spinTimer = setInterval(async () => {
      this.spinFrame = (this.spinFrame + 1) % SPIN.length;
      await this.renderAll();
    }, 300);

    const sd = serialReader.getData();
    try {
      writeFileSync(STATE_FILE, JSON.stringify({
        connected: sd.connected,
        b1Capacity: sd.b1.capacity,
        networkType: this.connResult.type,
        networkSSID: this.connResult.ssid || "",
      }));
    } catch (writeErr) {
      streamDeck.logger.error(`[diagnostics] failed to write state file: ${writeErr}`);
    }

    try {
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${DIAG_SCRIPT}" -StateFile "${STATE_FILE}" -OutFile "${RESULT_FILE}"`,
        { timeout: 60_000 },
      );
      const m = stdout.match(/SUMMARY:(\d+)\|(\d+)\|(\d+)/);
      this.summary = m ? { pass: +m[1], warn: +m[2], fail: +m[3] } : { pass: 0, warn: 0, fail: 0 };
    } catch (err) {
      streamDeck.logger.error(`[diagnostics] powershell failed: ${err}`);
      this.summary = { pass: 0, warn: 0, fail: 1 };
    }

    if (this.spinTimer) { clearInterval(this.spinTimer); this.spinTimer = undefined; }
    this.diagState = "DONE";
    await this.renderAll();
  }

  // ── Rendering ────────────────────────────────────────────────────────

  private async renderAll(): Promise<void> { for (const a of this.active) await this.renderTo(a); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    try {
      // ── IDLE state ──
      if (this.diagState === "IDLE") {
        return void await setImageIfChanged(a, await cachedImage("diag|idle", () => {
          const px = createCanvas(C.BLUE);
          drawHealthIcon(px, 36, 3, "#88ccff");
          text(px, "DIAG", 36, 26, 2);
          text(px, "tap=connect", 36, 39, 1, "#aaddff", false);
          text(px, "& run checks", 36, 51, 1, "#aaaaaa", false);
          text(px, "hold=connect", 36, 63, 1, "#888888", false);
          return px;
        }));
      }

      // ── CONNECTING state ──
      if (this.diagState === "CONNECTING") {
        const key = `diag|conn|${this.spinFrame}`;
        return void await setImageIfChanged(a, await cachedImage(key, () => {
          const px = createCanvas("#1a2744");
          drawWifiIcon(px, 36, 3, "#88ccff");
          text(px, "NETWORK", 36, 26, 1, "#ffffff", true);
          text(px, SPIN[this.spinFrame], 36, 44, 3);
          text(px, "connecting", 36, 62, 1, "#88bbdd", false);
          return px;
        }));
      }

      // ── RUNNING state ──
      if (this.diagState === "RUNNING") {
        const key = `diag|run|${this.spinFrame}`;
        return void await setImageIfChanged(a, await cachedImage(key, () => {
          const px = createCanvas(C.GRAY);
          drawGearIcon(px, 36, 3, "#aaaaaa");
          text(px, "CHECKING", 36, 26, 1, "#ffffff", true);
          text(px, SPIN[this.spinFrame], 36, 50, 3);
          text(px, "please wait", 36, 65, 1, "#aaaaaa", false);
          return px;
        }));
      }

      // ── DONE state ──
      const s  = this.summary ?? { pass: 0, warn: 0, fail: 0 };
      const conn = this.connResult;

      // Background color based on results
      const bg = s.fail > 0 ? C.RED : s.warn > 0 ? C.YELLOW : C.GREEN;
      const key = `diag|done|${s.pass}|${s.warn}|${s.fail}|${conn.type}|${conn.ssid || ""}`;

      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Result icon
        if (s.fail > 0) drawXIcon(px, 36, 4, "#ff8888");
        else            drawCheckIcon(px, 36, 4, "#88ff88");

        // Network connection info
        if (conn.type === "wifi") {
          const ssid = conn.ssid && conn.ssid.length > 10 ? conn.ssid.slice(0, 9) + ".." : (conn.ssid || "WiFi");
          text(px, `W: ${ssid}`, 36, 20, 1, "#cccccc", false);
        } else if (conn.type === "cellular") {
          text(px, "CELL", 36, 20, 1, "#cccccc", false);
        } else {
          text(px, "NO NET", 36, 20, 1, "#ff8888", false);
        }

        // Result (scale 2)
        const label = s.fail > 0 ? "FAIL" : s.warn > 0 ? "WARN" : "OK";
        text(px, label, 36, 38, 2);

        // Pass/warn/fail counts
        text(px, `${s.pass}ok ${s.warn}wn ${s.fail}er`, 36, 51, 1, "#ffffff", false);

        // Action hints
        text(px, "tap=report", 36, 62, 1, "#dddddd", false);
        text(px, "hold=reconn", 36, 71, 1, "#aaaaaa", false);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[diagnostics] render error: ${err}`);
    }
  }
}
