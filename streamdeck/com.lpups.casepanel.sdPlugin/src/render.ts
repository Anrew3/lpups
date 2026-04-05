/**
 * render.ts
 *
 * SVG-based 72×72 button image generator.
 * Returns base64 data URIs accepted by the Stream Deck SDK setImage() call.
 * Stream Deck software (Electron/Chromium) renders SVG natively —
 * no canvas, no native modules required.
 */

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

/** Build a 72×72 SVG button and return a base64 data URI. */
export function makeButton(bg: string, lines: Line[]): string {
  const texts = lines.map(l => {
    const w = l.bold !== false ? "bold" : "normal";
    const c = l.color ?? "#ffffff";
    const s = l.size  ?? 13;
    return `<text x="36" y="${l.y}" text-anchor="middle" `
      + `font-family="Arial,Helvetica,sans-serif" `
      + `font-size="${s}" font-weight="${w}" fill="${c}">${esc(l.text)}</text>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">`
    + `<rect width="72" height="72" rx="6" fill="${bg}"/>`
    + texts
    + `</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Horizontal fill bar  ████░░░  */
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

/** Dim "no data" button shown before serial connects. */
export function noDataButton(label: string): string {
  return makeButton(C.DKGRAY, [
    { text: label,     y: 28, size: 13 },
    { text: "NO DATA", y: 50, size: 11, color: "#ff8888" },
  ]);
}
