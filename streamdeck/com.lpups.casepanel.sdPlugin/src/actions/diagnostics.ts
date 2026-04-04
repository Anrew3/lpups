/**
 * diagnostics.ts — Key 6  "Get Help"
 *
 * Runs a comprehensive set of 15 sanity checks via PowerShell and displays
 * a pass/warn/fail summary on the button.
 *
 *   First press   → starts checks, button shows animated progress
 *   While running → button shows "CHECKING  ████░░░░"
 *   On completion → button shows "8✓ 2⚠ 1✗" (colour = worst state)
 *   Second press  → opens the detailed text report in Notepad
 *   Hold 3 s      → re-runs checks even if results are showing
 *
 * The PowerShell script also checks the Arduino serial reader's live state
 * (via a temp file the plugin writes before running diagnostics).
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, readFileSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { serialReader } from "../serial-reader";
import { makeButton, C } from "../render";

const execAsync = promisify(exec);
const SCRIPT    = path.join(__dirname, "..", "..", "scripts", "diagnostics.ps1");
const RESULT_FILE = path.join(os.tmpdir(), "lpups-diagnostics.txt");
const STATE_FILE  = path.join(os.tmpdir(), "lpups-serial-state.json");

type DiagState = "IDLE" | "RUNNING" | "DONE";

interface Summary { pass: number; warn: number; fail: number; }

@action({ UUID: "com.lpups.casepanel.diagnostics" })
export class Diagnostics extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active   = new Set<any>();
  private diagState: DiagState = "IDLE";
  private summary: Summary | null = null;
  private pressStart = 0;
  private spinTimer?: NodeJS.Timeout;
  private spinFrame  = 0;
  private readonly SPIN = ["▖", "▘", "▝", "▗"];

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    await this.renderAll();
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0 && this.spinTimer) clearInterval(this.spinTimer);
  }

  override onKeyDown(_ev: KeyDownEvent): void {
    this.pressStart = Date.now();
  }

  override async onKeyUp(_ev: KeyUpEvent): Promise<void> {
    const held = Date.now() - this.pressStart;

    if (held >= 2500 || this.diagState === "IDLE") {
      // Start / re-run diagnostics
      await this.runDiagnostics();
    } else if (this.diagState === "DONE") {
      // Second tap — open detail report
      if (existsSync(RESULT_FILE)) {
        exec(`notepad.exe "${RESULT_FILE}"`);
      }
    }
  }

  private async runDiagnostics(): Promise<void> {
    this.diagState = "RUNNING";
    this.spinFrame = 0;
    await this.renderAll();

    // Spin animation while checking
    this.spinTimer = setInterval(async () => {
      this.spinFrame = (this.spinFrame + 1) % this.SPIN.length;
      await this.renderAll();
    }, 400);

    // Write live serial state for the PS script to read
    const sd = serialReader.getData();
    writeFileSync(STATE_FILE, JSON.stringify({
      connected:   sd.connected,
      b1Capacity:  sd.b1.capacity,
      b2Present:   sd.b2.present,
    }));

    try {
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -StateFile "${STATE_FILE}" -OutFile "${RESULT_FILE}"`
      );
      // PS script outputs "SUMMARY:pass|warn|fail" on last line
      const m = stdout.match(/SUMMARY:(\d+)\|(\d+)\|(\d+)/);
      this.summary = m
        ? { pass: +m[1], warn: +m[2], fail: +m[3] }
        : { pass: 0, warn: 0, fail: 0 };
    } catch {
      this.summary = { pass: 0, warn: 0, fail: 1 };
    }

    if (this.spinTimer) clearInterval(this.spinTimer);
    this.diagState = "DONE";
    await this.renderAll();
  }

  private async renderAll(): Promise<void> {
    for (const a of this.active) await this.renderTo(a);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    if (this.diagState === "IDLE") {
      await a.setImage(makeButton(C.BLUE, [
        { text: "GET HELP",   y: 24, size: 14 },
        { text: "tap to run", y: 42, size: 10, color: "#aaddff", bold: false },
        { text: "15 checks",  y: 57, size: 10, color: "#aaaaaa", bold: false },
        { text: "hold=re-run",y: 69, size: 9,  color: "#888888", bold: false },
      ]));
      return;
    }

    if (this.diagState === "RUNNING") {
      await a.setImage(makeButton(C.GRAY, [
        { text: "CHECKING",             y: 20, size: 13 },
        { text: this.SPIN[this.spinFrame], y: 40, size: 22 },
        { text: "please wait...",        y: 60, size: 10, color: "#aaaaaa", bold: false },
      ]));
      return;
    }

    // DONE
    const s   = this.summary ?? { pass: 0, warn: 0, fail: 0 };
    const bg  = s.fail > 0 ? C.RED : s.warn > 0 ? C.YELLOW : C.GREEN;
    const overall = s.fail > 0 ? "ISSUES FOUND" : s.warn > 0 ? "WARNINGS" : "ALL CLEAR";

    await a.setImage(makeButton(bg, [
      { text: "GET HELP",          y: 13, size: 10, color: "#cccccc", bold: false },
      { text: overall,             y: 29, size: 13 },
      { text: `${s.pass}✓ ${s.warn}⚠ ${s.fail}✗`, y: 47, size: 14 },
      { text: "tap=open report",   y: 61, size: 9,  color: "#dddddd", bold: false },
      { text: "hold=re-run",       y: 71, size: 9,  color: "#aaaaaa", bold: false },
    ]));
  }
}
