import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import {
  createCanvas, text, drawBoltIcon, drawDivider,
  cachedImage, setImageIfChanged, noDataButton, C,
} from "../render";

@action({ UUID: "com.lpups.casepanel.power" })
export class PowerRuntime extends SingletonAction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private active = new Set<any>();
  private dataHandler       = (d: UPSData) => this.renderAll(d);
  private connectHandler    = ()           => this.renderAll(serialReader.getData());
  private disconnectHandler = ()           => this.showNoData();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.active.add(ev.action);
    serialReader.off("data", this.dataHandler).off("connect", this.connectHandler).off("disconnect", this.disconnectHandler);
    serialReader.on("data",  this.dataHandler).on("connect",  this.connectHandler).on("disconnect",  this.disconnectHandler);
    const d = serialReader.getData();
    await (d.connected ? this.renderTo(ev.action, d) : setImageIfChanged(ev.action, await noDataButton("POWER")));
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0)
      serialReader.off("data", this.dataHandler).off("connect", this.connectHandler).off("disconnect", this.disconnectHandler);
  }

  override onKeyDown(_ev: KeyDownEvent): void { /* display-only */ }

  private async renderAll(d: UPSData): Promise<void> {
    for (const a of this.active) await this.renderTo(a, d);
  }

  private async showNoData(): Promise<void> {
    const img = await noDataButton("POWER");
    for (const a of this.active) await setImageIfChanged(a, img);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, d: UPSData): Promise<void> {
    try {
      const { b2 }    = d;
      const bg        = !b2.present ? C.GRAY : b2.state === "CHARGING" ? C.TEAL : C.BLUE;
      const rtH       = Math.floor(b2.runtime / 60);
      const rtM       = b2.runtime % 60;
      const runtime   = b2.present && b2.runtime > 0 ? (rtH > 0 ? `${rtH}h ${rtM}m` : `${rtM}m`) : "--";
      const wattStr   = b2.present ? `${b2.draw}W` : "--";
      const rtScale   = runtime.length <= 6 ? 2 : 1;
      const key       = `pwr|${bg}|${b2.present}|${b2.draw}|${b2.avgCurrent}|${b2.runtime}|${b2.state}`;

      await a.setTitle("");
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Bolt icon (yellow if charging, blue-ish otherwise)
        drawBoltIcon(px, 36, 3, b2.state === "CHARGING" ? "#ffdd44" : "#88ccff");

        // Big wattage (scale 2)
        text(px, wattStr, 36, 28, 2);

        // Current draw
        text(px, b2.present ? `~${b2.avgCurrent}mA` : "-- mA", 36, 39, 1, "#aaddff", false);

        // Divider
        drawDivider(px, 42);

        // Runtime label
        text(px, "RUNTIME", 36, 52, 1, "#888888", false);

        // Runtime value (auto-scale: scale 2 if ≤6 chars, else scale 1)
        text(px, runtime, 36, 67, rtScale);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[power] render error: ${err}`);
    }
  }
}
