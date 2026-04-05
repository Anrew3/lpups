/**
 * render.ts
 *
 * Produces base64 PNG data URIs for Stream Deck keys using @napi-rs/canvas
 * (N-API stable ABI — works with any Node.js version, including the one
 * bundled inside Stream Deck software).
 *
 * Key size: 72 × 72 px.
 * All functions are async because canvas.encode() is async.
 */

import { createCanvas } from "@napi-rs/canvas";

export interface Line {
  text:   string | number;
  y:      number;
  size?:  number;
  color?: string;
  bold?:  boolean;
}

// ─── Colour palette ──────────────────────────────────────────────────────────
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

/** Rounded-rectangle path helper. */
function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

/** Build a 72×72 PNG button with a solid background and text lines. */
export async function makeButton(bg: string, lines: Line[]): Promise<string> {
  const canvas = createCanvas(72, 72);
  const ctx    = canvas.getContext("2d");

  // Background
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, 72, 72, 6);
  ctx.fill();

  // Text lines
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  for (const l of lines) {
    const weight = l.bold !== false ? "bold" : "normal";
    ctx.font      = `${weight} ${l.size ?? 13}px Arial, sans-serif`;
    ctx.fillStyle = l.color ?? "#ffffff";
    ctx.fillText(String(l.text), 36, l.y);
  }

  const buf = await canvas.encode("png");
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Horizontal progress bar  ████░░░░ */
export function pctBar(pct: number, width = 7): string {
  const n = Math.round(Math.min(100, Math.max(0, pct)) / 100 * width);
  return "\u2588".repeat(n) + "\u2591".repeat(width - n);
}

/** Background colour based on battery percentage. */
export function battColor(pct: number): string {
  if (pct >= 50) return C.GREEN;
  if (pct >= 25) return C.YELLOW;
  if (pct >= 10) return C.ORANGE;
  return C.RED;
}

/** Dim grey "no data" button. */
export async function noDataButton(label: string): Promise<string> {
  return makeButton(C.DKGRAY, [
    { text: label,     y: 28, size: 13 },
    { text: "NO DATA", y: 50, size: 11, color: "#ff8888" },
  ]);
}
