/**
 * render.ts
 *
 * Generates 72×72 PNG key images using pure Node.js (zero dependencies).
 * Provides pixel-art icons, thick progress bars, and a 5×7 bitmap font.
 * All drawing operates on a 72×72 RGBA pixel buffer.
 */

import { deflate } from "zlib";
import { promisify } from "util";

const deflateAsync = promisify(deflate);
const S = 72; // key size

// ─── CRC32 ───────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG builder ─────────────────────────────────────────────────────────────
function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "ascii");
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, c]);
}

async function encodePNG(px: Uint8Array): Promise<Buffer> {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rowLen = 1 + S * 4;
  const raw = Buffer.alloc(S * rowLen);
  for (let y = 0; y < S; y++) {
    raw[y * rowLen] = 0; // filter: None
    const dst = y * rowLen + 1, src = y * S * 4;
    for (let i = 0; i < S * 4; i++) raw[dst + i] = px[src + i];
  }
  const compressed = await deflateAsync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", compressed), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── 5×7 bitmap font ────────────────────────────────────────────────────────
const FONT: Record<number, number[]> = {
  32:[0,0,0,0,0,0,0], 33:[4,4,4,4,4,0,4], 34:[10,10,10,0,0,0,0],
  35:[10,10,31,10,31,10,10], 36:[4,15,20,14,5,30,4], 37:[24,25,2,4,8,19,3],
  38:[12,18,12,13,18,13,0], 39:[4,4,0,0,0,0,0], 40:[2,4,8,8,8,4,2],
  41:[8,4,2,2,2,4,8], 42:[0,4,21,14,21,4,0], 43:[0,4,4,31,4,4,0],
  44:[0,0,0,0,0,4,8], 45:[0,0,0,14,0,0,0], 46:[0,0,0,0,0,0,4],
  47:[1,1,2,4,8,16,16],
  48:[14,17,19,21,25,17,14], 49:[4,12,4,4,4,4,14], 50:[14,17,1,2,4,8,31],
  51:[14,17,1,6,1,17,14], 52:[2,6,10,18,31,2,2], 53:[31,16,30,1,1,17,14],
  54:[6,8,16,30,17,17,14], 55:[31,1,2,4,8,8,8], 56:[14,17,17,14,17,17,14],
  57:[14,17,17,15,1,2,12],
  58:[0,0,4,0,4,0,0], 59:[0,0,4,0,4,4,8], 60:[1,2,4,8,4,2,1],
  61:[0,0,31,0,31,0,0], 62:[16,8,4,2,4,8,16], 63:[14,17,1,2,4,0,4],
  64:[14,17,23,21,23,16,14],
  65:[4,10,17,17,31,17,17], 66:[30,17,17,30,17,17,30], 67:[14,17,16,16,16,17,14],
  68:[28,18,17,17,17,18,28], 69:[31,16,16,30,16,16,31], 70:[31,16,16,30,16,16,16],
  71:[14,17,16,19,17,17,14], 72:[17,17,17,31,17,17,17], 73:[14,4,4,4,4,4,14],
  74:[7,2,2,2,2,18,12], 75:[17,18,20,24,20,18,17], 76:[16,16,16,16,16,16,31],
  77:[17,27,21,21,17,17,17], 78:[17,17,25,21,19,17,17], 79:[14,17,17,17,17,17,14],
  80:[30,17,17,30,16,16,16], 81:[14,17,17,17,21,18,13], 82:[30,17,17,30,20,18,17],
  83:[14,17,16,14,1,17,14], 84:[31,4,4,4,4,4,4], 85:[17,17,17,17,17,17,14],
  86:[17,17,17,17,17,10,4], 87:[17,17,17,21,21,27,10], 88:[17,17,10,4,10,17,17],
  89:[17,17,10,4,4,4,4], 90:[31,1,2,4,8,16,31],
  91:[14,8,8,8,8,8,14], 92:[16,16,8,4,2,1,1], 93:[14,2,2,2,2,2,14],
  94:[4,10,17,0,0,0,0], 95:[0,0,0,0,0,0,31], 96:[8,4,0,0,0,0,0],
  97:[0,0,14,1,15,17,15], 98:[16,16,30,17,17,17,30], 99:[0,0,14,16,16,17,14],
  100:[1,1,15,17,17,17,15], 101:[0,0,14,17,31,16,14], 102:[6,9,8,28,8,8,8],
  103:[0,0,15,17,15,1,14], 104:[16,16,22,25,17,17,17], 105:[4,0,12,4,4,4,14],
  106:[2,0,6,2,2,18,12], 107:[16,16,18,20,24,20,18], 108:[12,4,4,4,4,4,14],
  109:[0,0,26,21,21,17,17], 110:[0,0,22,25,17,17,17], 111:[0,0,14,17,17,17,14],
  112:[0,0,30,17,30,16,16], 113:[0,0,15,17,15,1,1], 114:[0,0,22,25,16,16,16],
  115:[0,0,15,16,14,1,30], 116:[8,8,28,8,8,9,6], 117:[0,0,17,17,17,19,13],
  118:[0,0,17,17,17,10,4], 119:[0,0,17,17,21,21,10], 120:[0,0,17,10,4,10,17],
  121:[0,0,17,17,15,1,14], 122:[0,0,31,2,4,8,31],
  123:[2,4,4,8,4,4,2], 124:[4,4,4,4,4,4,4], 125:[8,4,4,2,4,4,8],
  126:[0,13,18,0,0,0,0],
};

const GW = 5, GH = 7;

// ─── Colour helpers ─────────────────────────────────────────────────────────
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const C = {
  GREEN:  "#0d6e0d",  YELLOW: "#7a5a00",  ORANGE: "#8a3d00",  RED:    "#7a0d0d",
  BLUE:   "#0d3d7a",  TEAL:   "#0d5a5a",  PURPLE: "#4a0d7a",  GRAY:   "#2a2a2a",
  DKGRAY: "#1a1a1a",
} as const;

export function battColor(pct: number): string {
  if (pct >= 50) return C.GREEN;
  if (pct >= 25) return C.YELLOW;
  if (pct >= 10) return C.ORANGE;
  return C.RED;
}

// ─── Canvas API ─────────────────────────────────────────────────────────────

/** Create a 72×72 RGBA pixel buffer with rounded-rect background. */
export function createCanvas(bg: string): Uint8Array {
  const px = new Uint8Array(S * S * 4);
  const [r, g, b] = parseHex(bg);
  const R = 6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let inside = true;
      const corners: [number, number][] = [[0, 0], [S, 0], [0, S], [S, S]];
      for (const [cx, cy] of corners) {
        if (Math.abs(x - cx) < R && Math.abs(y - cy) < R) {
          const dx = (cx === 0 ? R - x - 0.5 : x - (S - R) + 0.5);
          const dy = (cy === 0 ? R - y - 0.5 : y - (S - R) + 0.5);
          if (dx > 0 && dy > 0 && dx * dx + dy * dy > R * R) inside = false;
        }
      }
      const off = (y * S + x) * 4;
      if (inside) { px[off] = r; px[off + 1] = g; px[off + 2] = b; px[off + 3] = 255; }
    }
  }
  return px;
}

/** Fill a rectangle. */
export function fillRect(px: Uint8Array, x: number, y: number, w: number, h: number, color: string): void {
  const [r, g, b] = parseHex(color);
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const px_x = x + dx, px_y = y + dy;
    if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
      const off = (px_y * S + px_x) * 4;
      px[off] = r; px[off + 1] = g; px[off + 2] = b; px[off + 3] = 255;
    }
  }
}

/** Draw centered text. Returns the pixel width of the rendered text. */
export function text(
  px: Uint8Array, str: string, cx: number, baseY: number,
  scale = 2, color = "#ffffff", bold = true,
): number {
  const [r, g, b] = parseHex(color);
  const gap = scale;
  const totalW = str.length * (GW * scale + gap) - gap;
  let cursorX = Math.round(cx - totalW / 2);

  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)!;
    if (code > 0xFFFF) i++;
    const glyph = FONT[code] ?? FONT[63];
    const topY = baseY - GH * scale + 1;
    for (let gy = 0; gy < GH; gy++) {
      let row = glyph[gy];
      if (bold) row |= (row >> 1);
      for (let gx = 0; gx < GW; gx++) {
        if (row & (1 << (GW - 1 - gx))) {
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            const px_x = cursorX + gx * scale + sx, px_y = topY + gy * scale + sy;
            if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
              const off = (px_y * S + px_x) * 4;
              px[off] = r; px[off + 1] = g; px[off + 2] = b; px[off + 3] = 255;
            }
          }
        }
      }
    }
    cursorX += GW * scale + gap;
  }
  return totalW;
}

/** Thick progress bar with rounded ends. */
export function drawBar(
  px: Uint8Array, x: number, y: number, w: number, h: number,
  pct: number, fgColor: string, bgColor: string,
): void {
  const fillW = Math.round(w * Math.min(100, Math.max(0, pct)) / 100);
  const [fR, fG, fB] = parseHex(fgColor);
  const [bR, bG, bB] = parseHex(bgColor);
  const rad = Math.floor(h / 2);

  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    // Rounded ends
    let inside = true;
    if (dx < rad) {
      const ddx = rad - dx - 0.5, ddy = (dy - h / 2 + 0.5);
      if (ddx * ddx + ddy * ddy > rad * rad) inside = false;
    } else if (dx >= w - rad) {
      const ddx = dx - (w - rad) + 0.5, ddy = (dy - h / 2 + 0.5);
      if (ddx * ddx + ddy * ddy > rad * rad) inside = false;
    }
    if (!inside) continue;

    const px_x = x + dx, px_y = y + dy;
    if (px_x < 0 || px_x >= S || px_y < 0 || px_y >= S) continue;
    const off = (px_y * S + px_x) * 4;
    if (dx < fillW) { px[off] = fR; px[off + 1] = fG; px[off + 2] = fB; }
    else             { px[off] = bR; px[off + 1] = bG; px[off + 2] = bB; }
    px[off + 3] = 255;
  }
}

/** Horizontal divider line. */
export function drawDivider(px: Uint8Array, y: number, color = "#444444", margin = 8): void {
  fillRect(px, margin, y, S - margin * 2, 1, color);
}

// ─── Pixel-art icons ────────────────────────────────────────────────────────

function drawShape(px: Uint8Array, data: number[][], x: number, y: number, color: string): void {
  const [r, g, b] = parseHex(color);
  for (let dy = 0; dy < data.length; dy++) {
    const row = data[dy];
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx]) {
        const px_x = x + dx, px_y = y + dy;
        if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
          const off = (px_y * S + px_x) * 4;
          px[off] = r; px[off + 1] = g; px[off + 2] = b; px[off + 3] = 255;
        }
      }
    }
  }
}

/** Horizontal battery icon (iOS-style). cx = center X. */
export function drawBatteryIcon(
  px: Uint8Array, cx: number, y: number,
  pct: number, outlineColor: string, fillColor: string, bgColor: string,
): void {
  const W = 30, H = 14, NUB = 3;
  const x = Math.round(cx - (W + NUB) / 2);
  // Outline
  fillRect(px, x, y, W, H, outlineColor);
  // Inner background
  fillRect(px, x + 2, y + 2, W - 4, H - 4, bgColor);
  // Fill level
  const innerW = W - 4;
  const fillW = Math.round(innerW * Math.min(100, Math.max(0, pct)) / 100);
  if (fillW > 0) fillRect(px, x + 2, y + 2, fillW, H - 4, fillColor);
  // Terminal nub
  fillRect(px, x + W, y + 3, NUB, H - 6, outlineColor);
}

/** Lightning bolt icon. */
export function drawBoltIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const bolt = [
    [0,0,0,0,1,1,1,1,0],
    [0,0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0,0],
    [0,1,1,1,1,0,0,0,0],
    [1,1,1,1,1,1,1,1,1],
    [0,0,0,0,1,1,1,1,0],
    [0,0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0,0],
    [0,1,1,1,1,0,0,0,0],
    [1,1,1,0,0,0,0,0,0],
  ];
  drawShape(px, bolt, cx - 4, y, color);
}

/** WiFi signal icon (3 arcs). */
export function drawWifiIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const wifi = [
    [0,0,0,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,0,0,0,0,0,1,1,0,0],
    [0,1,1,0,0,0,0,0,0,0,1,1,0],
    [0,0,0,0,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,0,0,0,1,1,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,1,0,0,0,0,0,0],
  ];
  drawShape(px, wifi, cx - 6, y, color);
}

/** Cellular signal bars icon. bars = 0-4. */
export function drawCellBarsIcon(px: Uint8Array, cx: number, y: number, bars: number, activeColor: string, dimColor: string): void {
  const x = cx - 10;
  for (let i = 0; i < 4; i++) {
    const bh = 4 + i * 3; // 4, 7, 10, 13
    const bx = x + i * 6;
    const by = y + 13 - bh;
    fillRect(px, bx, by, 4, bh, i < bars ? activeColor : dimColor);
  }
}

/** Alert/warning triangle. */
export function drawAlertIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const tri = [
    [0,0,0,0,0,0,1,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,0,0,0,0,0],
    [0,0,0,0,1,1,0,1,1,0,0,0,0],
    [0,0,0,0,1,1,0,1,1,0,0,0,0],
    [0,0,0,1,1,0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,1,0,1,1,0,0,0],
    [0,0,1,1,0,0,1,0,0,1,1,0,0],
    [0,0,1,1,0,0,0,0,0,1,1,0,0],
    [0,1,1,0,0,0,1,0,0,0,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1,1],
  ];
  drawShape(px, tri, cx - 6, y, color);
}

/** Gear/settings icon. */
export function drawGearIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const gear = [
    [0,0,0,1,1,1,0,0,0],
    [0,1,1,1,1,1,1,1,0],
    [0,1,1,0,0,0,1,1,0],
    [1,1,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,1,1],
    [0,1,1,0,0,0,1,1,0],
    [0,1,1,1,1,1,1,1,0],
    [0,0,0,1,1,1,0,0,0],
  ];
  drawShape(px, gear, cx - 4, y, color);
}

/** Checkmark icon. */
export function drawCheckIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const check = [
    [0,0,0,0,0,0,0,0,1,1],
    [0,0,0,0,0,0,0,1,1,0],
    [0,0,0,0,0,0,1,1,0,0],
    [0,0,0,0,0,1,1,0,0,0],
    [1,1,0,0,1,1,0,0,0,0],
    [0,1,1,1,1,0,0,0,0,0],
    [0,0,1,1,0,0,0,0,0,0],
  ];
  drawShape(px, check, cx - 5, y, color);
}

/** X / cross icon. */
export function drawXIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const xIcon = [
    [1,1,0,0,0,1,1],
    [0,1,1,0,1,1,0],
    [0,0,1,1,1,0,0],
    [0,0,1,1,1,0,0],
    [0,1,1,0,1,1,0],
    [1,1,0,0,0,1,1],
  ];
  drawShape(px, xIcon, cx - 3, y, color);
}

/** Medical cross / health icon. */
export function drawHealthIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const cross = [
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
  ];
  drawShape(px, cross, cx - 4, y, color);
}

/** Power button icon. */
export function drawPowerBtnIcon(px: Uint8Array, cx: number, y: number, color: string): void {
  const icon = [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,1,0,1,1,0,1,0,0],
    [0,1,1,0,1,1,0,1,1,0],
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,1,1],
    [0,1,1,0,0,0,0,1,1,0],
    [0,0,1,1,0,0,1,1,0,0],
    [0,0,0,1,1,1,1,0,0,0],
  ];
  drawShape(px, icon, cx - 5, y, color);
}

// ─── Build final image ──────────────────────────────────────────────────────

/** Convert pixel buffer to data:image/png;base64,... URI. */
export async function toDataURI(px: Uint8Array): Promise<string> {
  const png = await encodePNG(px);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ─── Image cache ────────────────────────────────────────────────────────────
const IMAGE_CACHE = new Map<string, string>();
const MAX_CACHE = 64;

/** Cache-aware image builder. Pass a deterministic key string. */
export async function cachedImage(key: string, build: () => Uint8Array): Promise<string> {
  const cached = IMAGE_CACHE.get(key);
  if (cached) return cached;
  const px = build();
  const uri = await toDataURI(px);
  if (IMAGE_CACHE.size >= MAX_CACHE) {
    const oldest = IMAGE_CACHE.keys().next().value;
    if (oldest !== undefined) IMAGE_CACHE.delete(oldest);
  }
  IMAGE_CACHE.set(key, uri);
  return uri;
}

// ─── setImageIfChanged — skip redundant WebSocket sends ─────────────────────
const lastImages = new WeakMap<object, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setImageIfChanged(action: any, image: string): Promise<void> {
  if (lastImages.get(action) === image) return;
  lastImages.set(action, image);
  await action.setImage(image);
}

// ─── Legacy API (makeButton) — still works, used by simpler keys ────────────

export interface Line {
  text: string | number;
  y: number;
  size?: number;
  color?: string;
  bold?: boolean;
}

export async function makeButton(bg: string, lines: Line[]): Promise<string> {
  const key = bg + "|" + JSON.stringify(lines);
  return cachedImage(key, () => {
    const px = createCanvas(bg);
    for (const l of lines) {
      const txt = String(l.text);
      const sz = l.size ?? 13;
      const scale = sz >= 13 ? (() => {
        const w2 = txt.length * (GW * 2 + 2) - 2;
        return w2 <= 70 ? 2 : 1;
      })() : 1;
      text(px, txt, 36, l.y, scale, l.color ?? "#ffffff", l.bold !== false);
    }
    return px;
  });
}

export function pctBar(pct: number, width = 7): string {
  const n = Math.round(Math.min(100, Math.max(0, pct)) / 100 * width);
  return "\u2588".repeat(n) + "\u2591".repeat(width - n);
}

export async function noDataButton(label: string): Promise<string> {
  return cachedImage(`nodata|${label}`, () => {
    const px = createCanvas(C.DKGRAY);
    drawAlertIcon(px, 36, 14, "#ff6666");
    text(px, label, 36, 40, 1, "#888888", false);
    text(px, "NO DATA", 36, 55, 1, "#ff8888", true);
    return px;
  });
}
