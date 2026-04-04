/**
 * power.ts — Key 2
 * Live power draw, 5-min avg current, runtime remaining.
 */

import { action, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import { makeButton, noDataButton, C } from "../render";

@action({ UUID: "com.lpups.casepanel.power" })
export class PowerRuntime extends SingletonAction {
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
    await (d.connected ? this.renderTo(ev.action, d) : ev.action.setImage(noDataButton("POWER")));
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      serialReader.off("data",       this.dataHandler);
      serialReader.off("connect",    this.connectHandler);
      serialReader.off("disconnect", this.disconnectHandler);
    }
  }

  private async renderAll(d: UPSData): Promise<void> {
    for (const a of this.active) await this.renderTo(a, d);
  }

  private async showNoData(): Promise<void> {
    for (const a of this.active) await a.setImage(noDataButton("POWER"));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, d: UPSData): Promise<void> {
    const { b2 } = d;
    const bg = !b2.present ? C.GRAY
             : b2.state === "CHARGING" ? C.TEAL
             : C.BLUE;

    const runtime = b2.present && b2.runtime > 0
      ? `${Math.floor(b2.runtime / 60)}h ${b2.runtime % 60}m`
      : "-- min";

    await a.setTitle("");
    await a.setImage(makeButton(bg, [
      { text: "POWER",                             y: 12, size: 10, color: "#cccccc", bold: false },
      { text: b2.present ? `${b2.draw} W` : "--",  y: 31, size: 18 },
      { text: b2.present ? `~${b2.avgCurrent} mA` : "-- mA", y: 47, size: 12, color: "#aaddff", bold: false },
      { text: "RUNTIME",                           y: 59, size: 9,  color: "#999999", bold: false },
      { text: runtime,                             y: 71, size: 13 },
    ]));
  }
}
