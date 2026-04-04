/**
 * battery.ts — Key 1
 *
 * Shows B1 (18650 UPS) and B2 (12V LiON pack) capacity on one button.
 * Background colour driven by the worst of the two states.
 * Charging lightning bolt shown on B1 when AC is present.
 */

import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import { makeButton, battColor, pctBar, noDataButton, C } from "../render";

@action({ UUID: "com.lpups.casepanel.battery" })
export class BatteryStatus extends SingletonAction {
  // Store active button contexts so we can update them from the data handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active = new Set<any>();
  private handler = (d: UPSData) => this.refresh(d);

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    const d = serialReader.getData();
    await (d.connected ? this.renderTo(ev.action, d) : ev.action.setImage(noDataButton("BATTERY")));
    serialReader.on("data", this.handler);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) serialReader.off("data", this.handler);
  }

  private async refresh(d: UPSData): Promise<void> {
    for (const a of this.active) await this.renderTo(a, d);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, d: UPSData): Promise<void> {
    const { b1, b2 } = d;

    // Worst-state drives background
    const worstPct = b2.present ? Math.min(b1.capacity, b2.capacity) : b1.capacity;
    const bg = !b2.present ? C.RED : battColor(worstPct);

    const b1Line  = `B1 ${b1.capacity}%${b1.acPresent ? " ⚡" : ""}`;
    const b1Bar   = pctBar(b1.capacity);
    const b2Line  = b2.present ? `B2 ${b2.capacity}%` : "B2 ABSENT";
    const b2Bar   = b2.present ? pctBar(b2.capacity) : "───────";

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "BATTERY", y: 12, size: 10, color: "#cccccc", bold: false },
      { text: b1Line,    y: 29, size: 15 },
      { text: b1Bar,     y: 42, size: 11, color: "#aaffaa", bold: false },
      { text: b2Line,    y: 56, size: 13 },
      { text: b2Bar,     y: 68, size: 11, color: b2.present ? "#aaffaa" : "#ff8888", bold: false },
    ]));
  }
}
