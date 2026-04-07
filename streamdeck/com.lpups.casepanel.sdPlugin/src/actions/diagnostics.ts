import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";
import { serialReader } from "../serial-reader";
import { makeButton, setImageIfChanged, C } from "../render";

const execAsync   = promisify(exec);
const SCRIPT      = path.join(__dirname, "..", "scripts", "diagnostics.ps1");
const RESULT_FILE = path.join(os.tmpdir(), "lpups-diagnostics.txt");
const STATE_FILE  = path.join(os.tmpdir(), "lpups-serial-state.json");
type DiagState    = "IDLE" | "RUNNING" | "DONE";
interface Summary  { pass: number; warn: number; fail: number; }
const SPIN         = ["|", "/", "-", "\\"];

@action({ UUID: "com.lpups.casepanel.diagnostics" })
export class Diagnostics extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active     = new Set<any>();
  private diagState: DiagState = "IDLE";
  private summary:   Summary | null = null;
  private pressStart = 0;
  private spinTimer?: NodeJS.Timeout;
  private spinFrame  = 0;

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
    if (held >= 2500 || this.diagState === "IDLE") {
      await this.runDiagnostics();
    } else if (this.diagState === "DONE" && existsSync(RESULT_FILE)) {
      exec(`notepad.exe "${RESULT_FILE}"`);
    }
  }

  private async runDiagnostics(): Promise<void> {
    if (this.diagState === "RUNNING") return; // Prevent concurrent runs
    this.diagState = "RUNNING"; this.spinFrame = 0;
    await this.renderAll();
    this.spinTimer = setInterval(async () => { this.spinFrame = (this.spinFrame + 1) % SPIN.length; await this.renderAll(); }, 300);
    const sd = serialReader.getData();
    writeFileSync(STATE_FILE, JSON.stringify({ connected: sd.connected, b1Capacity: sd.b1.capacity, b2Present: sd.b2.present }));
    try {
      const { stdout } = await execAsync(
        `powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT}" -StateFile "${STATE_FILE}" -OutFile "${RESULT_FILE}"`,
        { timeout: 60_000 },
      );
      const m = stdout.match(/SUMMARY:(\d+)\|(\d+)\|(\d+)/);
      this.summary = m ? { pass: +m[1], warn: +m[2], fail: +m[3] } : { pass: 0, warn: 0, fail: 0 };
    } catch { this.summary = { pass: 0, warn: 0, fail: 1 }; }
    if (this.spinTimer) clearInterval(this.spinTimer);
    this.diagState = "DONE";
    await this.renderAll();
  }

  private async renderAll(): Promise<void> { for (const a of this.active) await this.renderTo(a); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any): Promise<void> {
    try {
      if (this.diagState === "IDLE") {
        return void await setImageIfChanged(a, await makeButton(C.BLUE, [
          { text: "DIAG",       y: 22, size: 14 },
          { text: "tap to run", y: 40, size: 10, color: "#aaddff", bold: false },
          { text: "15 checks",  y: 55, size: 10, color: "#aaaaaa", bold: false },
          { text: "hold=rerun", y: 68, size: 9,  color: "#888888", bold: false },
        ]));
      }
      if (this.diagState === "RUNNING") {
        return void await setImageIfChanged(a, await makeButton(C.GRAY, [
          { text: "CHECKING",          y: 20, size: 13 },
          { text: SPIN[this.spinFrame], y: 44, size: 24 },
          { text: "please wait",       y: 62, size: 10, color: "#aaaaaa", bold: false },
        ]));
      }
      const s = this.summary ?? { pass: 0, warn: 0, fail: 0 };
      await setImageIfChanged(a, await makeButton(s.fail > 0 ? C.RED : s.warn > 0 ? C.YELLOW : C.GREEN, [
        { text: "DIAG",                                y: 13, size: 10, color: "#cccccc", bold: false },
        { text: s.fail > 0 ? "ISSUES" : s.warn > 0 ? "WARNINGS" : "ALL CLEAR", y: 29, size: 13 },
        { text: `${s.pass}ok ${s.warn}wn ${s.fail}er`, y: 46, size: 12 },
        { text: "tap=report",                          y: 60, size: 9,  color: "#dddddd", bold: false },
        { text: "hold=rerun",                          y: 71, size: 9,  color: "#aaaaaa", bold: false },
      ]));
    } catch (err) {
      streamDeck.logger.error(`[diagnostics] render error: ${err}`);
    }
  }
}
