/**
 * serial-reader.ts
 *
 * Spawns scripts/serial-reader.ps1 which opens the Arduino COM port at
 * 115200 baud and streams every line to stdout.  Parses the structured
 * B1 telemetry blocks emitted by the Arduino sketch and fires typed
 * EventEmitter events.
 *
 * Events:
 *   connect(port: string)   — Arduino COM port opened successfully
 *   disconnect()            — port closed or process exited
 *   data(d: UPSData)        — complete telemetry packet (~every 3 s)
 *   event(line: string)     — !!! or >>> alert line from the Arduino
 *   stderr(msg: string)     — stderr output from PowerShell
 *   error(msg: string)      — fatal error (max retries exceeded)
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import { existsSync } from "fs";
import path from "path";

// __dirname is <plugin-root>/bin/ when bundled by tsup
const PS_SCRIPT        = path.join(__dirname, "..", "scripts", "serial-reader.ps1");
const BASE_RETRY_MS    = 8000;
const MAX_RETRY_MS     = 120_000;
const MAX_RETRY_COUNT  = 50;

// ─── Data types ───────────────────────────────────────────────────────────────

export interface B1Data {
  capacity:    number;   // 0–100 %
  runtime:     number;   // seconds
  charging:    boolean;
  acPresent:   boolean;
  voltage:     number;   // mV
  current:     number;   // mA
  temperature: number;   // °C
}

export interface UPSData {
  b1:         B1Data;
  lastEvent:  string;
  lastUpdate: Date;
  connected:  boolean;
}

// ─── Safe number parsing (returns fallback on NaN) ────────────────────────────

function safeInt(val: string, fallback = 0): number {
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class SerialReader extends EventEmitter {
  private proc?:           ChildProcess;
  private reconnectTimer?: NodeJS.Timeout;
  private running    = false;
  private retryCount = 0;
  private _lastError = "";

  // Accumulate key-value lines into a pending packet until a blank line fires them
  private parseBlock: "NONE" | "B1" = "NONE";
  private pending = {
    b1: {} as Partial<B1Data>,
  };

  private _data: UPSData = {
    b1: { capacity: 0, runtime: 0, charging: false, acPresent: false,
          voltage: 0, current: 0, temperature: 0 },
    lastEvent:  "",
    lastUpdate: new Date(0),
    connected:  false,
  };

  getData(): UPSData {
    return {
      ...this._data,
      b1: { ...this._data.b1 },
    };
  }

  /** Last error message from the serial reader (for diagnostics). */
  getLastError(): string { return this._lastError; }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Verify script exists before attempting spawn
    if (!existsSync(PS_SCRIPT)) {
      this._lastError = `Script not found: ${PS_SCRIPT}`;
      this.emit("error", this._lastError);
      return;
    }

    this.spawnScript();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    this.proc?.kill();
    this.proc = undefined;
  }

  private spawnScript(): void {
    if (!this.running) return;

    let child: ChildProcess;
    try {
      child = spawn("powershell.exe", [
        "-NonInteractive", "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", PS_SCRIPT,
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this._lastError = `Failed to spawn PowerShell: ${msg}`;
      this.emit("error", this._lastError);
      this.scheduleRetry();
      return;
    }

    this.proc = child;

    // ── CRITICAL: Handle spawn errors (e.g., powershell.exe not found) ──
    child.on("error", (err: Error) => {
      this._lastError = `PowerShell spawn error: ${err.message}`;
      this.emit("stderr", this._lastError);
    });

    // Only set up readline if stdout is available
    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on("line", line => {
        try {
          this.handleLine(line.trimEnd());
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emit("stderr", `Parse error: ${msg}`);
        }
      });
    } else {
      this.emit("stderr", "PowerShell process has no stdout — cannot read serial data");
    }

    child.on("close", (code) => {
      if (this._data.connected) {
        this._data.connected = false;
        this.emit("disconnect");
      }
      this.proc = undefined;
      if (code !== 0 && code !== null) {
        this._lastError = `PowerShell exited with code ${code}`;
        this.emit("stderr", this._lastError);
      }
      if (!this.running) return;
      this.scheduleRetry();
    });

    // Log stderr so PowerShell script errors are visible
    child.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        this._lastError = msg;
        this.emit("stderr", msg);
      }
    });
  }

  private scheduleRetry(): void {
    if (this.retryCount >= MAX_RETRY_COUNT) {
      this._lastError = `Gave up after ${MAX_RETRY_COUNT} retries`;
      this.emit("error", this._lastError);
      return;
    }
    const delay = Math.min(BASE_RETRY_MS * Math.pow(2, this.retryCount), MAX_RETRY_MS);
    const jitter = Math.random() * 1000;
    this.retryCount++;
    this.reconnectTimer = setTimeout(() => this.spawnScript(), delay + jitter);
  }

  private handleLine(line: string): void {
    // Blank line = end of a complete packet
    if (!line) {
      if (this.parseBlock !== "NONE") {
        this.flushPending();
        this.parseBlock = "NONE";
      }
      return;
    }

    // PS script connection / error markers
    if (line.startsWith("CONNECTED:")) {
      this._data.connected = true;
      this.retryCount = 0;
      this.emit("connect", line.slice("CONNECTED:".length));
      return;
    }
    if (line.startsWith("ERROR:")) {
      this._lastError = line.slice(6).trim();
      this.emit("stderr", `Serial script: ${this._lastError}`);
      return;
    }

    // Arduino event lines  (!!!, >>>)
    if (line.startsWith("!!!") || line.startsWith(">>>")) {
      this._data.lastEvent  = line;
      this._data.lastUpdate = new Date();
      this.emit("event", line);
      return;
    }

    // Block header
    if (line.includes("B1 (18650 UPS)")) {
      this.parseBlock = "B1";
      this.pending.b1 = {};
      return;
    }

    // Key-value lines:  "  key    = value unit"
    const kv = line.match(/^\s+(\S.*?)\s*=\s*(.+?)\s*$/);
    if (!kv) return;
    const key = kv[1].toLowerCase().trim();
    const val = kv[2].trim();

    if (this.parseBlock === "B1") {
      this.parseB1Line(key, val);
    }
  }

  private parseB1Line(key: string, val: string): void {
    const b = this.pending.b1;
    switch (key) {
      case "capacity":    b.capacity    = safeInt(val);                break;
      case "runtime":     b.runtime     = safeInt(val);                break;
      case "charging":    b.charging    = val.toUpperCase() === "YES"; break;
      case "ac present":  b.acPresent   = val.toUpperCase() === "YES"; break;
      case "voltage":     b.voltage     = safeInt(val);                break;
      case "current":     b.current     = safeInt(val);                break;
      case "temperature": case "temp":
                          b.temperature = safeInt(val);                break;
    }
  }

  private flushPending(): void {
    const b1 = this.pending.b1;

    if (b1.capacity    !== undefined) this._data.b1.capacity    = b1.capacity;
    if (b1.runtime     !== undefined) this._data.b1.runtime     = b1.runtime;
    if (b1.charging    !== undefined) this._data.b1.charging    = b1.charging;
    if (b1.acPresent   !== undefined) this._data.b1.acPresent   = b1.acPresent;
    if (b1.voltage     !== undefined) this._data.b1.voltage     = b1.voltage;
    if (b1.current     !== undefined) this._data.b1.current     = b1.current;
    if (b1.temperature !== undefined) this._data.b1.temperature = b1.temperature;

    this._data.lastUpdate = new Date();
    if (this.listenerCount("data") > 0) {
      this.emit("data", this.getData());
    }
  }
}

export const serialReader = new SerialReader();
