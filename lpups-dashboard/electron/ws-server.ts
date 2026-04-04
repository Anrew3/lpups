/**
 * ws-server.ts
 * WebSocket server on port 8766.
 * Broadcasts UPSData to all connected clients (Stream Deck plugin, etc.)
 * whenever the serial reader emits new data.
 */

import { WebSocketServer, WebSocket } from "ws";
import { SerialReader } from "./serial";
import { UPSData } from "./types";

const PORT = 8766;

export class WSBroadcaster {
  private wss: WebSocketServer | null = null;

  start(serial: SerialReader): void {
    this.wss = new WebSocketServer({ port: PORT });

    this.wss.on("listening", () => {
      console.log(`[ws] Broadcasting on ws://localhost:${PORT}`);
    });

    this.wss.on("connection", (ws) => {
      // Send current state immediately on connect
      const state = serial.getState();
      ws.send(JSON.stringify({ type: "data", payload: state }));
    });

    serial.on("data", (state: UPSData) => {
      this.broadcast({ type: "data", payload: state });
    });

    serial.on("event", (msg: string) => {
      this.broadcast({ type: "event", payload: msg });
    });

    serial.on("connect", (port: string) => {
      this.broadcast({ type: "connect", payload: port });
    });

    serial.on("disconnect", () => {
      this.broadcast({ type: "disconnect", payload: null });
    });
  }

  stop(): void {
    this.wss?.close();
  }

  private broadcast(msg: object): void {
    if (!this.wss) return;
    const json = JSON.stringify(msg);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }
}
