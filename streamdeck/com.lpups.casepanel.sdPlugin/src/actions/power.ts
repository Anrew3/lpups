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
      const { b1 }  = d;
      const bg      = b1.charging ? C.TEAL : b1.acPresent ? C.BLUE : C.GRAY;
      const volts   = b1.voltage > 0 ? `${(b1.voltage / 1000).toFixed(2)}V` : "--";
      const currStr = b1.current !== 0 ? `${b1.current}mA` : "--";
      const rtMin   = Math.floor(b1.runtime / 60);
      const runtime = b1.runtime > 0 ? (rtMin >= 60 ? `${Math.floor(rtMin / 60)}h ${rtMin % 60}m` : `${rtMin}m`) : "--";
      const key     = `pwr|${bg}|${b1.voltage}|${b1.current}|${b1.runtime}|${b1.charging}`;

      await a.setTitle("");
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Bolt icon (yellow if charging, blue-ish otherwise)
        drawBoltIcon(px, 36, 3, b1.charging ? "#ffdd44" : "#88ccff");

        // Voltage (scale 2)
        text(px, volts, 36, 28, 2);

        // Current
        text(px, currStr, 36, 39, 1, "#aaddff", false);

        // Divider
        drawDivider(px, 42);

        // Runtime label
        text(px, "RUNTIME", 36, 52, 1, "#888888", false);

        // Runtime value
        text(px, runtime, 36, 67, runtime.length <= 6 ? 2 : 1);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[power] render error: ${err}`);
    }
  }
}
