/**
 * serial.ts
 * Spawns scripts/serial-reader.ps1 and parses the structured Arduino output
 * into UPSData.  Re-spawns automatically after 6 s if the process dies.
 * Emits 'data', 'event', 'connect', 'disconnect'.
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as readline from "readline";
import { UPSData, defaultUPS } from "./types";

const SCRIPTS_DIR = path.join(__dirname, "..", "scripts");
const RECONNECT_MS = 6000;

export class SerialReader extends EventEmitter {
  private proc: ChildProcess | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private state: UPSData = { ...defaultUPS, b1: { ...defaultUPS.b1 }, b2: { ...defaultUPS.b2 } };
  private rawBuf: string[] = [];

  start(): void {
    if (this.running) return;
    this.running = true;
    this.spawn();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.proc) this.proc.kill();
  }

  getState(): UPSData {
    return this.state;
  }

  private spawn(): void {
    const ps = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", path.join(SCRIPTS_DIR, "serial-reader.ps1"),
    ], { windowsHide: true });

    this.proc = ps;

    const rl = readline.createInterface({ input: ps.stdout! });
    rl.on("line", (line) => this.handleLine(line.trim()));

    ps.stderr?.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) console.warn("[serial stderr]", msg);
    });

    ps.on("exit", () => {
      if (this.state.connected) {
        this.state = { ...this.state, connected: false };
        this.emit("disconnect");
      }
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this.spawn(), RECONNECT_MS);
      }
    });
  }

  private handleLine(line: string): void {
    if (!line) return;

    // Maintain rolling raw buffer (last 40 lines)
    this.rawBuf.push(line);
    if (this.rawBuf.length > 40) this.rawBuf.shift();

    // ── Connection events ──────────────────────────────────────────────────
    if (line.startsWith("CONNECTED:")) {
      this.state = { ...this.state, connected: true, rawLines: [...this.rawBuf] };
      this.emit("connect", line.slice(10));
      return;
    }
    if (line.startsWith("ERROR:")) {
      this.state = { ...this.state, connected: false };
      this.emit("disconnect");
      return;
    }

    // ── Arduino EVENT lines ────────────────────────────────────────────────
    // Anything starting with "EVENT:" is a named event
    if (line.startsWith("EVENT:")) {
      this.emit("event", line.slice(6).trim());
      return;
    }

    // ── Structured key=value parsing ──────────────────────────────────────
    // Example lines from threeBatteriesAndLion sketch:
    //   b1 voltage     = 12345 mV
    //   b1 capacity    = 85 %
    //   b1 current     = -450 mA
    //   b1 ac present  = 1
    //   b1 charging    = 1
    //   b1 temp        = 28 C
    //   b2 present     = 1
    //   b2 voltage     = 11980 mV
    //   b2 current     = 850 mA
    //   b2 remaining   = 73 %
    //   b2 charging    = 0
    //   b2 draw        = 10 W
    //   b2 avg current = 820 mA
    //   b2 runtime     = 120 min   (or "--")

    const lower = line.toLowerCase();

    const numVal = (): number => {
      const m = line.match(/-?\d+/);
      return m ? parseInt(m[0], 10) : 0;
    };
    const boolVal = (): boolean => /=\s*1/.test(line);

    if (lower.includes("b1 voltage"))       this.state.b1.voltage     = numVal();
    else if (lower.includes("b1 capacity")) this.state.b1.capacity    = numVal();
    else if (lower.includes("b1 current"))  this.state.b1.current     = numVal();
    else if (lower.includes("b1 ac"))       this.state.b1.acPresent   = boolVal();
    else if (lower.includes("b1 charg"))    this.state.b1.charging    = boolVal();
    else if (lower.includes("b1 temp"))     this.state.b1.temperature = numVal();
    else if (lower.includes("b2 present"))  this.state.b2.present     = boolVal();
    else if (lower.includes("b2 voltage"))  this.state.b2.voltage     = numVal();
    else if (lower.includes("b2 current") && !lower.includes("avg")) {
      this.state.b2.current = numVal();
    }
    else if (lower.includes("b2 remaining"))  this.state.b2.remaining   = numVal();
    else if (lower.includes("b2 charg"))      this.state.b2.charging    = boolVal();
    else if (lower.includes("b2 draw"))       this.state.b2.powerDrawW  = numVal();
    else if (lower.includes("avg current"))   this.state.b2.avgCurrentMA = numVal();
    else if (lower.includes("b2 runtime")) {
      // "120 min" or "--"
      const m = line.match(/(\d+)\s*min/i);
      this.state.b2.runtimeMins = m ? parseInt(m[1], 10) : 0;
    }

    // After each field update, emit data with latest snapshot
    this.state.timestamp = Date.now();
    this.state.rawLines  = [...this.rawBuf];
    this.emit("data", this.state);
  }
}
