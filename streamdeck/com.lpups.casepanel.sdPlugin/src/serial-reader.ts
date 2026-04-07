/**
 * serial-reader.ts
 *
 * Spawns scripts/serial-reader.ps1 which opens the Arduino COM port at
 * 115200 baud and streams every line to stdout.  Parses the structured
 * B1/B2 telemetry blocks emitted by the Arduino sketch and fires typed
 * EventEmitter events.
 *
 * Events:
 *   connect(port: string)   — Arduino COM port opened successfully
 *   disconnect()            — port closed or process exited
 *   data(d: UPSData)        — complete telemetry packet (~every 3 s)
 *   event(line: string)     — !!! or >>> alert line from the Arduino
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
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
  voltage:     number;   // mV  (not in serial output — always 0)
  current:     number;   // mA  (not in serial output — always 0)
  temperature: number;   // °C  (not in serial output — always 0)
}

export interface B2Data {
  voltage:    number;   // mV
  capacity:   number;   // 0–100 %
  present:    boolean;
  charging:   boolean;
  draw:       number;   // Watts
  avgCurrent: number;   // mA (5-min average)
  runtime:    number;   // minutes remaining
  state: "CHARGING" | "GOOD" | "LOW" | "CRITICAL" | "ABSENT" | "UNKNOWN";
}

export interface UPSData {
  b1:         B1Data;
  b2:         B2Data;
  lastEvent:  string;
  lastUpdate: Date;
  connected:  boolean;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

class SerialReader extends EventEmitter {
  private proc?:           ChildProcess;
  private reconnectTimer?: NodeJS.Timeout;
  private running    = false;
  private retryCount = 0;

  // Accumulate key-value lines into a pending packet until a blank line fires them
  private parseBlock: "NONE" | "B1" | "B2" = "NONE";
  private pending = {
    b1: {} as Partial<B1Data>,
    b2: {} as Partial<B2Data>,
  };

  private _data: UPSData = {
    b1: { capacity: 0, runtime: 0, charging: false, acPresent: false,
          voltage: 0, current: 0, temperature: 0 },
    b2: { voltage: 0, capacity: 0, present: false, charging: false,
          draw: 0, avgCurrent: 0, runtime: 0, state: "UNKNOWN" },
    lastEvent:  "",
    lastUpdate: new Date(0),
    connected:  false,
  };

  getData(): UPSData {
    return {
      ...this._data,
      b1: { ...this._data.b1 },
      b2: { ...this._data.b2 },
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.spawnScript();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.proc?.kill();
    this.proc = undefined;
  }

  private spawnScript(): void {
    if (!this.running) return;

    const child = spawn("powershell.exe", [
      "-NonInteractive", "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", PS_SCRIPT,
    ]);
    this.proc = child;

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", line => this.handleLine(line.trimEnd()));

    child.on("close", () => {
      if (this._data.connected) {
        this._data.connected = false;
        this.emit("disconnect");
      }
      this.proc = undefined;
      if (!this.running) return;

      // Exponential backoff: 8s → 16s → 32s → ... → capped at 120s
      if (this.retryCount >= MAX_RETRY_COUNT) {
        this.emit("error", `Serial reader gave up after ${MAX_RETRY_COUNT} retries`);
        return;
      }
      const delay = Math.min(BASE_RETRY_MS * Math.pow(2, this.retryCount), MAX_RETRY_MS);
      const jitter = Math.random() * 1000;
      this.retryCount++;
      this.reconnectTimer = setTimeout(() => this.spawnScript(), delay + jitter);
    });

    // Log stderr so PowerShell script errors are visible
    child.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) this.emit("stderr", msg);
    });
  }

  private handleLine(line: string): void {
    // Blank line = end of a complete B1 + B2 packet
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
      this.retryCount = 0; // Reset backoff on successful connection
      this.emit("connect", line.slice("CONNECTED:".length));
      return;
    }
    if (line.startsWith("ERROR:")) {
      // Script will exit — reconnect happens via the close handler
      return;
    }

    // Arduino event lines  (!!!, >>>)
    if (line.startsWith("!!!") || line.startsWith(">>>")) {
      this._data.lastEvent  = line;
      this._data.lastUpdate = new Date();
      this.emit("event", line);
      return;
    }

    // Block headers
    if (line.includes("B1 (18650 UPS)")) {
      this.parseBlock = "B1";
      this.pending.b1 = {};
      return;
    }
    if (line.includes("B2 (12V LiON pack)")) {
      this.parseBlock = "B2";
      this.pending.b2 = {};
      return;
    }

    // Key-value lines:  "  key    = value unit"
    const kv = line.match(/^\s+(\S.*?)\s*=\s*(.+?)\s*$/);
    if (!kv) return;
    const key = kv[1].toLowerCase().trim();
    const val = kv[2].trim();

    if (this.parseBlock === "B1") {
      this.parseB1Line(key, val);
    } else if (this.parseBlock === "B2") {
      this.parseB2Line(key, val);
    }
  }

  private parseB1Line(key: string, val: string): void {
    const b = this.pending.b1;
    switch (key) {
      case "capacity":    b.capacity  = parseInt(val);               break;
      case "runtime":     b.runtime   = parseInt(val);               break;
      case "charging":    b.charging  = val.toUpperCase() === "YES"; break;
      case "ac present":  b.acPresent = val.toUpperCase() === "YES"; break;
    }
  }

  private parseB2Line(key: string, val: string): void {
    const b = this.pending.b2;
    switch (key) {
      case "voltage":     b.voltage    = parseInt(val);                     break;
      case "capacity":    b.capacity   = parseInt(val);                     break;
      case "present":     b.present    = val.toUpperCase() === "YES";       break;
      case "charging":    b.charging   = val.toUpperCase() === "YES";       break;
      case "draw":        b.draw       = parseFloat(val);                   break;
      case "avg current": b.avgCurrent = parseInt(val);                     break;
      case "runtime":     b.runtime    = val === "--" ? 0 : parseInt(val);  break;
      case "state":       b.state      = this.toB2State(val);               break;
    }
  }

  private toB2State(s: string): B2Data["state"] {
    switch (s.toUpperCase()) {
      case "CHARGING":  return "CHARGING";
      case "GOOD":      return "GOOD";
      case "LOW":       return "LOW";
      case "CRITICAL":  return "CRITICAL";
      case "ABSENT":    return "ABSENT";
      default:          return "UNKNOWN";
    }
  }

  private flushPending(): void {
    const b1 = this.pending.b1;
    const b2 = this.pending.b2;

    if (b1.capacity  !== undefined) this._data.b1.capacity  = b1.capacity;
    if (b1.runtime   !== undefined) this._data.b1.runtime   = b1.runtime;
    if (b1.charging  !== undefined) this._data.b1.charging  = b1.charging;
    if (b1.acPresent !== undefined) this._data.b1.acPresent = b1.acPresent;

    if (b2.voltage    !== undefined) this._data.b2.voltage    = b2.voltage;
    if (b2.capacity   !== undefined) this._data.b2.capacity   = b2.capacity;
    if (b2.present    !== undefined) this._data.b2.present    = b2.present;
    if (b2.charging   !== undefined) this._data.b2.charging   = b2.charging;
    if (b2.draw       !== undefined) this._data.b2.draw       = b2.draw;
    if (b2.avgCurrent !== undefined) this._data.b2.avgCurrent = b2.avgCurrent;
    if (b2.runtime    !== undefined) this._data.b2.runtime    = b2.runtime;
    if (b2.state      !== undefined) this._data.b2.state      = b2.state;

    this._data.lastUpdate = new Date();
    if (this.listenerCount("data") > 0) {
      this.emit("data", this.getData());
    }
  }
}

export const serialReader = new SerialReader();
