import streamDeck, { action, SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";
import { serialReader } from "../serial-reader";
import {
  createCanvas, text, drawAlertIcon,
  cachedImage, setImageIfChanged, C,
} from "../render";

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
    serialReader.off("data", this.dataHandler).off("event", this.eventHandler).off("connect", this.connectHandler).off("disconnect", this.disconnectHandler);
    serialReader.on("data",  this.dataHandler).on("event",  this.eventHandler).on("connect",  this.connectHandler).on("disconnect",  this.disconnectHandler);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.active.delete(ev.action);
    if (this.active.size === 0) {
      if (this.flashTimer) { clearTimeout(this.flashTimer); this.flashTimer = undefined; }
      serialReader.off("data", this.dataHandler).off("event", this.eventHandler).off("connect", this.connectHandler).off("disconnect", this.disconnectHandler);
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
    try {
      const d   = serialReader.getData();
      const bg  = flash ? C.ORANGE : !d.connected ? C.GRAY : C.TEAL;
      const raw = this.lastEvent || (d.connected ? "(no events)" : "NO SERIAL");
      const [l0, l1, l2] = this.wrapEvent(raw);
      const key = `evt|${bg}|${l0}|${l1}|${l2}`;

      await a.setTitle("");
      await setImageIfChanged(a, await cachedImage(key, () => {
        const px = createCanvas(bg);

        // Alert triangle icon (yellow flash on new event)
        drawAlertIcon(px, 36, 2, flash ? "#ffdd44" : "#ffffff");

        // "EVENTS" label
        text(px, "EVENTS", 36, 25, 1, "#aaaaaa", false);

        // Wrapped event text (3 lines, descending brightness)
        text(px, l0, 36, 40, 1, "#ffffff", true);
        text(px, l1, 36, 52, 1, "#dddddd", true);
        text(px, l2, 36, 64, 1, "#bbbbbb", false);

        return px;
      }));
    } catch (err) {
      streamDeck.logger.error(`[events] render error: ${err}`);
    }
  }

  private wrapEvent(s: string): [string, string, string] {
    const words = s.replace(/^[>!]{3}\s*/, "").split(" ");
    const c: string[] = ["", "", ""];
    let i = 0;
    for (const w of words) {
      if (i < 2 && c[i].length + w.length > 10) i++;
      if (i > 2) break;
      c[i] += (c[i] ? " " : "") + w;
    }
    return [c[0], c[1], c[2]];
  }
}
