import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { serialReader, UPSData } from "../serial-reader";
import {
  createCanvas, text, drawBar, drawDivider, drawBatteryIcon, drawBoltIcon,
  cachedImage, setImageIfChanged, noDataButton, battColor, C,
} from "../render";

@action({ UUID: "com.lpups.casepanel.battery" })
export class BatteryStatus extends SingletonAction {
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
    await (d.connected ? this.renderTo(ev.action, d) : setImageIfChanged(ev.action, await noDataButton("BATTERY")));
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
    const img = await noDataButton("BATTERY");
    for (const a of this.active) await setImageIfChanged(a, img);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async renderTo(a: any, d: UPSData): Promise<void> {
    try {
      const { b1, b2 } = d;
      const pct     = b2.present ? Math.min(b1.capacity, b2.capacity) : b1.capacity;
      const bg      = !b2.present ? C.ORANGE : battColor(pct);
      const barFill = pct >= 50 ? "#22cc66" : pct >= 25 ? "#cccc22" : pct >= 10 ? "#cc8822" : "#cc2222";
      const key     = `bat|${bg}|${b1.capacity}|${b2.capacity}|${b2.present}|${b1.acPresent}`;

      await a.setTitle("");
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Battery icon with fill level; bolt inside if AC present
        drawBatteryIcon(px, 36, 3, pct, "#ffffff", barFill, "#1a1a1a");
        if (b1.acPresent) drawBoltIcon(px, 36, 5, "#ffdd44");

        // Big percentage (scale 3 = large bold digits)
        text(px, `${pct}%`, 36, 39, 3);

        // Thick progress bar
        drawBar(px, 8, 43, 56, 5, pct, barFill, "#1a1a1a");

        // Divider
        drawDivider(px, 50);

        // B1 mini bar with label
        text(px, "B1", 12, 58, 1, "#aaaaaa", false);
        drawBar(px, 22, 55, 42, 3, b1.capacity, "#88ccff", "#222222");

        // B2 mini bar or ABSENT warning
        text(px, "B2", 12, 67, 1, "#aaaaaa", false);
        if (b2.present) {
          drawBar(px, 22, 64, 42, 3, b2.capacity, "#88ccff", "#222222");
        } else {
          text(px, "ABSENT", 46, 67, 1, "#ff8888", true);
        }

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[battery] render error: ${err}`);
    }
  }
}
