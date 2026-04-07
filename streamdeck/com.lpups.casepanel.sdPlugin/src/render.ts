/**
 * render.ts
 *
 * Generates 72×72 PNG key images using pure Node.js (zero dependencies).
 * Uses an embedded 5×7 bitmap font for text rendering and zlib for PNG
 * compression. Replaces the previous @napi-rs/canvas implementation.
 */

import { deflate } from "zlib";
import { promisify } from "util";

const deflateAsync = promisify(deflate);

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

// ─── PNG helpers ─────────────────────────────────────────────────────────────
function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "ascii");
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, c]);
}

async function buildPNG(w: number, h: number, rgba: Uint8Array): Promise<Buffer> {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const rowLen = 1 + w * 4; // filter byte + RGBA
  const raw = Buffer.alloc(h * rowLen);
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0; // filter: None
    const dstOff = y * rowLen + 1;
    const srcOff = y * w * 4;
    for (let i = 0; i < w * 4; i++) raw[dstOff + i] = rgba[srcOff + i];
  }
  const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const compressed = await deflateAsync(raw);
  return Buffer.concat([
    SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── 5×7 bitmap font ────────────────────────────────────────────────────────
// Each glyph: 7 rows, 5 bits per row (bit4=left, bit0=right)
// Covers ASCII 32–126 plus U+2588 (full block) and U+2591 (light shade)
const FONT: Record<number, number[]> = {
  // space
  32: [0,0,0,0,0,0,0],
  // !
  33: [4,4,4,4,4,0,4],
  // "
  34: [10,10,10,0,0,0,0],
  // #
  35: [10,10,31,10,31,10,10],
  // $
  36: [4,15,20,14,5,30,4],
  // %
  37: [24,25,2,4,8,19,3],
  // &
  38: [12,18,12,13,18,13,0],
  // '
  39: [4,4,0,0,0,0,0],
  // (
  40: [2,4,8,8,8,4,2],
  // )
  41: [8,4,2,2,2,4,8],
  // *
  42: [0,4,21,14,21,4,0],
  // +
  43: [0,4,4,31,4,4,0],
  // ,
  44: [0,0,0,0,0,4,8],
  // -
  45: [0,0,0,14,0,0,0],
  // .
  46: [0,0,0,0,0,0,4],
  // /
  47: [1,1,2,4,8,16,16],
  // 0
  48: [14,17,19,21,25,17,14],
  // 1
  49: [4,12,4,4,4,4,14],
  // 2
  50: [14,17,1,2,4,8,31],
  // 3
  51: [14,17,1,6,1,17,14],
  // 4
  52: [2,6,10,18,31,2,2],
  // 5
  53: [31,16,30,1,1,17,14],
  // 6
  54: [6,8,16,30,17,17,14],
  // 7
  55: [31,1,2,4,8,8,8],
  // 8
  56: [14,17,17,14,17,17,14],
  // 9
  57: [14,17,17,15,1,2,12],
  // :
  58: [0,0,4,0,4,0,0],
  // ;
  59: [0,0,4,0,4,4,8],
  // <
  60: [1,2,4,8,4,2,1],
  // =
  61: [0,0,31,0,31,0,0],
  // >
  62: [16,8,4,2,4,8,16],
  // ?
  63: [14,17,1,2,4,0,4],
  // @
  64: [14,17,23,21,23,16,14],
  // A
  65: [4,10,17,17,31,17,17],
  // B
  66: [30,17,17,30,17,17,30],
  // C
  67: [14,17,16,16,16,17,14],
  // D
  68: [28,18,17,17,17,18,28],
  // E
  69: [31,16,16,30,16,16,31],
  // F
  70: [31,16,16,30,16,16,16],
  // G
  71: [14,17,16,19,17,17,14],
  // H
  72: [17,17,17,31,17,17,17],
  // I
  73: [14,4,4,4,4,4,14],
  // J
  74: [7,2,2,2,2,18,12],
  // K
  75: [17,18,20,24,20,18,17],
  // L
  76: [16,16,16,16,16,16,31],
  // M
  77: [17,27,21,21,17,17,17],
  // N
  78: [17,17,25,21,19,17,17],
  // O
  79: [14,17,17,17,17,17,14],
  // P
  80: [30,17,17,30,16,16,16],
  // Q
  81: [14,17,17,17,21,18,13],
  // R
  82: [30,17,17,30,20,18,17],
  // S
  83: [14,17,16,14,1,17,14],
  // T
  84: [31,4,4,4,4,4,4],
  // U
  85: [17,17,17,17,17,17,14],
  // V
  86: [17,17,17,17,17,10,4],
  // W
  87: [17,17,17,21,21,27,10],
  // X
  88: [17,17,10,4,10,17,17],
  // Y
  89: [17,17,10,4,4,4,4],
  // Z
  90: [31,1,2,4,8,16,31],
  // [
  91: [14,8,8,8,8,8,14],
  // backslash
  92: [16,16,8,4,2,1,1],
  // ]
  93: [14,2,2,2,2,2,14],
  // ^
  94: [4,10,17,0,0,0,0],
  // _
  95: [0,0,0,0,0,0,31],
  // `
  96: [8,4,0,0,0,0,0],
  // a
  97: [0,0,14,1,15,17,15],
  // b
  98: [16,16,30,17,17,17,30],
  // c
  99: [0,0,14,16,16,17,14],
  // d
  100: [1,1,15,17,17,17,15],
  // e
  101: [0,0,14,17,31,16,14],
  // f
  102: [6,9,8,28,8,8,8],
  // g
  103: [0,0,15,17,15,1,14],
  // h
  104: [16,16,22,25,17,17,17],
  // i
  105: [4,0,12,4,4,4,14],
  // j
  106: [2,0,6,2,2,18,12],
  // k
  107: [16,16,18,20,24,20,18],
  // l
  108: [12,4,4,4,4,4,14],
  // m
  109: [0,0,26,21,21,17,17],
  // n
  110: [0,0,22,25,17,17,17],
  // o
  111: [0,0,14,17,17,17,14],
  // p
  112: [0,0,30,17,30,16,16],
  // q
  113: [0,0,15,17,15,1,1],
  // r
  114: [0,0,22,25,16,16,16],
  // s
  115: [0,0,15,16,14,1,30],
  // t
  116: [8,8,28,8,8,9,6],
  // u
  117: [0,0,17,17,17,19,13],
  // v
  118: [0,0,17,17,17,10,4],
  // w
  119: [0,0,17,17,21,21,10],
  // x
  120: [0,0,17,10,4,10,17],
  // y
  121: [0,0,17,17,15,1,14],
  // z
  122: [0,0,31,2,4,8,31],
  // {
  123: [2,4,4,8,4,4,2],
  // |
  124: [4,4,4,4,4,4,4],
  // }
  125: [8,4,4,2,4,4,8],
  // ~
  126: [0,13,18,0,0,0,0],
};

// Unicode block characters for pctBar
const CHAR_FULL_BLOCK  = 0x2588; // █
const CHAR_LIGHT_SHADE = 0x2591; // ░
FONT[CHAR_FULL_BLOCK]  = [31,31,31,31,31,31,31];
FONT[CHAR_LIGHT_SHADE] = [21,10,21,10,21,10,21];

const GLYPH_W = 5;
const GLYPH_H = 7;

function getGlyph(ch: number): number[] {
  return FONT[ch] ?? FONT[63]; // fallback to '?'
}

// ─── Text rendering ─────────────────────────────────────────────────────────
function measureText(text: string, scale: number): number {
  const gap = scale; // 1px gap at scale 1, 2px at scale 2
  return text.length * (GLYPH_W * scale + gap) - gap;
}

function pickScale(text: string, requestedSize: number): number {
  if (requestedSize >= 13) {
    const w2 = measureText(text, 2);
    if (w2 <= 70) return 2; // fits at 2× with 1px margin each side
  }
  return 1;
}

function drawText(
  px: Uint8Array, imgW: number, _imgH: number,
  text: string, centerX: number, baselineY: number,
  scale: number, r: number, g: number, b: number, bold: boolean,
): void {
  const totalW = measureText(text, scale);
  let cursorX = Math.round(centerX - totalW / 2);
  const gap = scale;

  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    // skip second code unit of surrogate pairs
    if (code > 0xFFFF) i++;
    const glyph = getGlyph(code);
    const topY = baselineY - GLYPH_H * scale + 1;

    for (let gy = 0; gy < GLYPH_H; gy++) {
      let row = glyph[gy];
      if (bold) row |= (row >> 1); // thicken horizontally for bold
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (row & (1 << (GLYPH_W - 1 - gx))) {
          // Draw scaled pixel
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px_x = cursorX + gx * scale + sx;
              const px_y = topY + gy * scale + sy;
              if (px_x >= 0 && px_x < imgW && px_y >= 0 && px_y < _imgH) {
                const off = (px_y * imgW + px_x) * 4;
                px[off]     = r;
                px[off + 1] = g;
                px[off + 2] = b;
                px[off + 3] = 255;
              }
            }
          }
          // Extra pixel to the right for bold at scale 1
          if (bold && scale === 1) {
            const bx = cursorX + gx * scale + 1;
            const by_start = topY + gy * scale;
            if (bx < imgW) {
              for (let sy = 0; sy < scale; sy++) {
                const by = by_start + sy;
                if (by >= 0 && by < _imgH) {
                  const off = (by * imgW + bx) * 4;
                  px[off]     = r;
                  px[off + 1] = g;
                  px[off + 2] = b;
                  px[off + 3] = 255;
                }
              }
            }
          }
        }
      }
    }
    cursorX += GLYPH_W * scale + gap;
  }
}

// ─── Rounded rect helper ────────────────────────────────────────────────────
function fillRoundedRect(
  px: Uint8Array, w: number, h: number,
  r: number, g: number, b: number, radius: number,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Check corners
      let inside = true;
      if (x < radius && y < radius) {
        // top-left
        const dx = radius - x - 0.5, dy = radius - y - 0.5;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      } else if (x >= w - radius && y < radius) {
        // top-right
        const dx = x - (w - radius) + 0.5, dy = radius - y - 0.5;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      } else if (x < radius && y >= h - radius) {
        // bottom-left
        const dx = radius - x - 0.5, dy = y - (h - radius) + 0.5;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      } else if (x >= w - radius && y >= h - radius) {
        // bottom-right
        const dx = x - (w - radius) + 0.5, dy = y - (h - radius) + 0.5;
        if (dx * dx + dy * dy > radius * radius) inside = false;
      }

      const off = (y * w + x) * 4;
      if (inside) {
        px[off]     = r;
        px[off + 1] = g;
        px[off + 2] = b;
        px[off + 3] = 255;
      } else {
        px[off] = px[off + 1] = px[off + 2] = px[off + 3] = 0;
      }
    }
  }
}

// ─── Hex colour parser ──────────────────────────────────────────────────────
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Image cache (avoids redundant deflate when data unchanged) ─────────────
const IMAGE_CACHE = new Map<string, string>();
const MAX_CACHE = 64;

function cacheKey(bg: string, lines: Line[]): string {
  return bg + "|" + JSON.stringify(lines);
}

function cacheGet(key: string): string | undefined {
  return IMAGE_CACHE.get(key);
}

function cachePut(key: string, value: string): void {
  if (IMAGE_CACHE.size >= MAX_CACHE) {
    // Evict oldest entry (first inserted)
    const oldest = IMAGE_CACHE.keys().next().value;
    if (oldest !== undefined) IMAGE_CACHE.delete(oldest);
  }
  IMAGE_CACHE.set(key, value);
}

// ─── setImageIfChanged — skip redundant WebSocket sends ─────────────────────
const lastImages = new WeakMap<object, string>();

/** Only call action.setImage() if the image has actually changed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setImageIfChanged(action: any, image: string): Promise<void> {
  if (lastImages.get(action) === image) return;
  lastImages.set(action, image);
  await action.setImage(image);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface Line {
  text:   string | number;
  y:      number;
  size?:  number;
  color?: string;
  bold?:  boolean;
}

export const C = {
  GREEN:  "#0d6e0d",
  YELLOW: "#7a5a00",
  ORANGE: "#8a3d00",
  RED:    "#7a0d0d",
  BLUE:   "#0d3d7a",
  TEAL:   "#0d5a5a",
  PURPLE: "#4a0d7a",
  GRAY:   "#2a2a2a",
  DKGRAY: "#1a1a1a",
} as const;

/** Build a 72×72 PNG button and return a base64 data URI (cached). */
export async function makeButton(bg: string, lines: Line[]): Promise<string> {
  const key = cacheKey(bg, lines);
  const cached = cacheGet(key);
  if (cached) return cached;

  const S = 72, R = 6;
  const px = new Uint8Array(S * S * 4);

  // Rounded-rectangle background
  const [bgR, bgG, bgB] = parseHex(bg);
  fillRoundedRect(px, S, S, bgR, bgG, bgB, R);

  // Text lines
  for (const l of lines) {
    const txt   = String(l.text);
    const [tr, tg, tb] = parseHex(l.color ?? "#ffffff");
    const scale = pickScale(txt, l.size ?? 13);
    const bold  = l.bold !== false;
    drawText(px, S, S, txt, 36, l.y, scale, tr, tg, tb, bold);
  }

  const png = await buildPNG(S, S, px);
  const result = `data:image/png;base64,${png.toString("base64")}`;
  cachePut(key, result);
  return result;
}

/** Progress bar  ████░░░ */
export function pctBar(pct: number, width = 7): string {
  const n = Math.round(Math.min(100, Math.max(0, pct)) / 100 * width);
  return "\u2588".repeat(n) + "\u2591".repeat(width - n);
}

/** Background colour for a battery percentage. */
export function battColor(pct: number): string {
  if (pct >= 50) return C.GREEN;
  if (pct >= 25) return C.YELLOW;
  if (pct >= 10) return C.ORANGE;
  return C.RED;
}

/** Dim "no serial data" button. */
export async function noDataButton(label: string): Promise<string> {
  return makeButton(C.DKGRAY, [
    { text: label,     y: 28, size: 13 },
    { text: "NO DATA", y: 50, size: 11, color: "#ff8888" },
  ]);
}
