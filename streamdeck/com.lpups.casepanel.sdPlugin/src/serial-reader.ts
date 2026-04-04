/**
 * serial-reader.ts
 *
 * Connects to the LPUPS Electron dashboard's WebSocket server at
 * ws://localhost:8766.  The Electron app is the sole owner of the Arduino
 * COM port and broadcasts structured UPSData to all connected clients.
 *
 * This allows the Stream Deck plugin to share data with the dashboard
 * without competing for the serial port.
 *
 * Falls back to reconnecting every 6 s if the Electron app is not running.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";

// ─── Data types (mirror of Electron dashboard types) ─────────────────────────

export interface B1Data {
  capacity:  number;   // 0–100 %
  runtime:   number;   // seconds (not provided by sketch — kept for compat)
  charging:  boolean;
  acPresent: boolean;
  voltage:   number;   // mV
  current:   number;   // mA
  temperature: number; // °C
}

export interface B2Data {
  voltage:    number;  // mV
  capacity:   number;  // 0–100 % (= remaining)
  present:    boolean;
  charging:   boolean;
  draw:       number;  // Watts
  avgCurrent: number;  // mA (5-min average)
  runtime:    number;  // minutes remaining
  state: "CHARGING" | "GOOD" | "LOW" | "CRITICAL" | "ABSENT" | "UNKNOWN";
}

export interface UPSData {
  b1:         B1Data;
  b2:         B2Data;
  lastEvent:  string;
  lastUpdate: Date;
  connected:  boolean;
}

// ─── WebSocket serial reader ──────────────────────────────────────────────────

const WS_URL         = "ws://localhost:8766";
const RECONNECT_MS   = 6000;

class SerialReader extends EventEmitter {
  private ws:               WebSocket | null = null;
  private reconnectTimer?:  NodeJS.Timeout;
  private running = false;

  private _data: UPSData = {
    b1: { capacity: 0, runtime: 0, charging: false, acPresent: false,
          voltage: 0, current: 0, temperature: 0 },
    b2: { voltage: 0, capacity: 0, present: false, charging: false,
          draw: 0, avgCurrent: 0, runtime: 0, state: "UNKNOWN" },
    lastEvent: "",
    lastUpdate: new Date(0),
    connected: false,
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
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.terminate();
  }

  private connect(): void {
    if (this.ws) {
      try { this.ws.terminate(); } catch { /* ignore */ }
      this.ws = null;
    }

    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      // Connected to Electron dashboard — it will send current state immediately
    });

    ws.on("message", (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload: unknown };
        this.handleMessage(msg);
      } catch { /* ignore malformed */ }
    });

    ws.on("close", () => {
      this._data.connected = false;
      this.emit("disconnect");
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
      }
    });

    ws.on("error", () => {
      // Error is always followed by close — reconnect handled there
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessage(msg: { type: string; payload: any }): void {
    switch (msg.type) {
      case "connect": {
        this._data.connected = true;
        this.emit("connect", String(msg.payload ?? ""));
        break;
      }
      case "disconnect": {
        this._data.connected = false;
        this.emit("disconnect");
        break;
      }
      case "event": {
        this._data.lastEvent  = String(msg.payload ?? "");
        this._data.lastUpdate = new Date();
        this.emit("event", this._data.lastEvent);
        break;
      }
      case "data": {
        const d = msg.payload;
        if (!d) break;

        this._data.connected = !!d.connected;

        // ── B1 ──────────────────────────────────────────────────────────
        if (d.b1) {
          this._data.b1.capacity    = d.b1.capacity    ?? 0;
          this._data.b1.charging    = !!d.b1.charging;
          this._data.b1.acPresent   = !!d.b1.acPresent;
          this._data.b1.voltage     = d.b1.voltage     ?? 0;
          this._data.b1.current     = d.b1.current     ?? 0;
          this._data.b1.temperature = d.b1.temperature ?? 0;
        }

        // ── B2 ──────────────────────────────────────────────────────────
        if (d.b2) {
          this._data.b2.present    = !!d.b2.present;
          this._data.b2.voltage    = d.b2.voltage      ?? 0;
          this._data.b2.capacity   = d.b2.remaining    ?? 0;  // note field name
          this._data.b2.charging   = !!d.b2.charging;
          this._data.b2.draw       = d.b2.powerDrawW   ?? 0;
          this._data.b2.avgCurrent = d.b2.avgCurrentMA ?? 0;
          this._data.b2.runtime    = d.b2.runtimeMins  ?? 0;
          this._data.b2.state      = deriveB2State(this._data.b2);
        }

        this._data.lastUpdate = new Date();
        this.emit("data", this.getData());
        break;
      }
    }
  }
}

function deriveB2State(b2: B2Data): B2Data["state"] {
  if (!b2.present)   return "ABSENT";
  if (b2.charging)   return "CHARGING";
  if (b2.capacity >= 50) return "GOOD";
  if (b2.capacity >= 20) return "LOW";
  return "CRITICAL";
}

export const serialReader = new SerialReader();
