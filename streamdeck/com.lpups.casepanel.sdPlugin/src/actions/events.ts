/**
 * events.ts — Key 4
 * Last Arduino event line (!!!  or  >>> alerts).
 * Flashes orange for 1.5 s when a new event arrives.
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { serialReader } from "../serial-reader";
import { makeButton, C } from "../render";

@action({ UUID: "com.lpups.casepanel.events" })
export class UpsEvents extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active    = new Set<any>();
  private lastEvent = "";
  private flashTimer?: NodeJS.Timeout;

  private dataHandler       = () => this.renderAll(false);
  private eventHandler      = (evt: string) => { this.lastEvent = evt; this.renderAll(true); };
  private connectHandler    = () => this.renderAll(false);
  private disconnectHandler = () => this.renderAll(false);

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    const d = serialReader.getData();
    if (d.lastEvent) this.lastEvent = d.lastEvent;
    await this.renderTo(ev.action, false);
    serialReader.off("data",       this.dataHandler);
    serialReader.off("event",      this.eventHandler);
    serialReader.off("connect",    this.connectHandler);
    serialReader.off("disconnect", this.disconnectHandler);
    serialReader.on("data",        this.dataHandler);
    serialReader.on("event",       this.eventHandler);
    serialReader.on("connect",     this.connectHandler);
    serialReader.on("disconnect",  this.disconnectHandler);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      serialReader.off("data",       this.dataHandler);
      serialReader.off("event",      this.eventHandler);
      serialReader.off("connect",    this.connectHandler);
      serialReader.off("disconnect", this.disconnectHandler);
    }
  }

  override onKeyDown(_ev: KeyDownEvent): void { /* display-only */ }

  private async renderAll(flash: boolean): Promise<void> {
    for (const a of this.active) await this.renderTo(a, flash);
    if (flash) {
      if (this.flashTimer) clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.renderAll(false), 1500);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, flash: boolean): Promise<void> {
    const d  = serialReader.getData();
    const bg = flash        ? C.ORANGE
             : !d.connected ? C.GRAY
             : C.TEAL;

    const raw   = this.lastEvent || (d.connected ? "(no events)" : "NO SERIAL");
    const lines = this.wrapEvent(raw);

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "EVENTS", y: 12, size: 10, color: "#cccccc", bold: false },
      { text: lines[0], y: 30, size: 12 },
      { text: lines[1], y: 46, size: 11, color: "#dddddd" },
      { text: lines[2], y: 61, size: 10, color: "#bbbbbb", bold: false },
    ]));
  }

  private wrapEvent(s: string): [string, string, string] {
    const clean = s.replace(/^[>!]{3}\s*/, "");
    const words = clean.split(" ");
    const chunks: string[] = ["", "", ""];
    let idx = 0;
    for (const w of words) {
      if (idx < 2 && (chunks[idx].length + w.length) > 10) idx++;
      if (idx > 2) break;
      chunks[idx] += (chunks[idx] ? " " : "") + w;
    }
    return [chunks[0] ?? "", chunks[1] ?? "", chunks[2] ?? ""];
  }
}
