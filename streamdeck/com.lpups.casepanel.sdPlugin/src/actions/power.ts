/**
 * power.ts — Key 2
 *
 * Live power draw (Watts) from the 12V pack and estimated runtime remaining
 * in minutes.  Also shows 5-minute average current so you can see if load
 * has been stable or spiking.
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import { makeButton, noDataButton, C } from "../render";

@action({ UUID: "com.lpups.casepanel.power" })
export class PowerRuntime extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active = new Set<any>();
  private handler = (d: UPSData) => this.refresh(d);

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    const d = serialReader.getData();
    await (d.connected ? this.renderTo(ev.action, d) : ev.action.setImage(noDataButton("POWER")));
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
    const { b2 } = d;

    // Background: teal when charging, blue when discharging, gray when absent
    const bg = !b2.present ? C.GRAY
             : b2.state === "CHARGING" ? C.TEAL
             : C.BLUE;

    const drawLine    = b2.present ? `${b2.draw} W` : "-- W";
    const avgLine     = b2.present ? `~${b2.avgCurrent} mA` : "-- mA";
    const runtimeLine = b2.present && b2.runtime > 0 ? `${b2.runtime} min` : "-- min";

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "POWER",     y: 12, size: 10, color: "#cccccc", bold: false },
      { text: drawLine,    y: 31, size: 18 },
      { text: avgLine,     y: 47, size: 12, color: "#aaddff", bold: false },
      { text: "RUNTIME",   y: 59, size: 9,  color: "#999999", bold: false },
      { text: runtimeLine, y: 71, size: 13 },
    ]));
  }
}
