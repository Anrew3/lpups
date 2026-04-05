/**
 * battery.ts — Key 1
 * B1 (18650 UPS) and B2 (12V LiON pack) capacity, state, charging.
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import { makeButton, battColor, pctBar, noDataButton, C } from "../render";

@action({ UUID: "com.lpups.casepanel.battery" })
export class BatteryStatus extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active = new Set<any>();

  private dataHandler       = (d: UPSData) => this.renderAll(d);
  private connectHandler    = ()           => this.renderAll(serialReader.getData());
  private disconnectHandler = ()           => this.showNoData();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    serialReader.off("data",       this.dataHandler);
    serialReader.off("connect",    this.connectHandler);
    serialReader.off("disconnect", this.disconnectHandler);
    serialReader.on("data",        this.dataHandler);
    serialReader.on("connect",     this.connectHandler);
    serialReader.on("disconnect",  this.disconnectHandler);

    const d = serialReader.getData();
    await (d.connected
      ? this.renderTo(ev.action, d)
      : ev.action.setImage(noDataButton("BATTERY")));
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      serialReader.off("data",       this.dataHandler);
      serialReader.off("connect",    this.connectHandler);
      serialReader.off("disconnect", this.disconnectHandler);
    }
  }

  override onKeyDown(_ev: KeyDownEvent): void { /* display-only */ }

  private async renderAll(d: UPSData): Promise<void> {
    for (const a of this.active) await this.renderTo(a, d);
  }

  private async showNoData(): Promise<void> {
    const img = noDataButton("BATTERY");
    for (const a of this.active) await a.setImage(img);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, d: UPSData): Promise<void> {
    const { b1, b2 } = d;
    const worstPct = b2.present ? Math.min(b1.capacity, b2.capacity) : b1.capacity;
    const bg       = !b2.present ? C.ORANGE : battColor(worstPct);

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "BATTERY",                                            y: 12, size: 10, color: "#cccccc", bold: false },
      { text: `B1 ${b1.capacity}%${b1.acPresent ? " AC" : ""}`,    y: 29, size: 15 },
      { text: pctBar(b1.capacity),                                  y: 42, size: 11, color: "#aaffaa", bold: false },
      { text: b2.present ? `B2 ${b2.capacity}%` : "B2 ABSENT",     y: 56, size: 13 },
      { text: b2.present ? pctBar(b2.capacity) : "-------",         y: 68, size: 11,
        color: b2.present ? "#aaffaa" : "#ff8888", bold: false },
    ]));
  }
}
