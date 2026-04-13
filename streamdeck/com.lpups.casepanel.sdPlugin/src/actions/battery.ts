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
      const { b1 } = d;
      const pct     = b1.capacity;
      const bg      = battColor(pct);
      const barFill = pct >= 50 ? "#22cc66" : pct >= 25 ? "#cccc22" : pct >= 10 ? "#cc8822" : "#cc2222";
      const key     = `bat|${bg}|${b1.capacity}|${b1.acPresent}|${b1.charging}`;

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

        // Status info
        const status = b1.charging ? "CHARGING" : b1.acPresent ? "AC POWER" : "BATTERY";
        text(px, status, 36, 58, 1, b1.charging ? "#44ff88" : "#aaaaaa", b1.charging);

        // Runtime
        const rtMin = Math.floor(b1.runtime / 60);
        const rtStr = b1.runtime > 0 ? (rtMin >= 60 ? `${Math.floor(rtMin / 60)}h ${rtMin % 60}m` : `${rtMin}m`) : "";
        if (rtStr) {
          text(px, rtStr, 36, 67, 1, "#88ccff", false);
        }

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[battery] render error: ${err}`);
    }
  }
}
