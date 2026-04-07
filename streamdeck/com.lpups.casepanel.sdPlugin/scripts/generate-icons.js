#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Generates all icons for the LPUPS Stream Deck plugin following Elgato SDK conventions.
 * Pure Node.js — zero external dependencies.
 *
 * Output structure (matches official samples):
 *   imgs/plugin/marketplace.png       (288x288)  + @2x (576x576)  — Full color branded
 *   imgs/plugin/category-icon.png     (28x28)    + @2x (56x56)    — White on transparent
 *   imgs/actions/{name}/icon.png      (20x20)    + @2x (40x40)    — White on transparent
 *   imgs/actions/{name}/key.png       (72x72)    + @2x (144x144)  — Colored default
 */

const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++)
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk & encoder ───────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, c]);
}

function encodePNG(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen);
  for (let y = 0; y < size; y++) {
    raw[y * rowLen] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowLen + 1 + x * 4;
      raw[dst] = px[src]; raw[dst+1] = px[src+1]; raw[dst+2] = px[src+2]; raw[dst+3] = px[src+3];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function parseHex(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function fillRect(px, S, x, y, w, h, r, g, b, a) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const px_x = x + dx, px_y = y + dy;
    if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
      const off = (px_y * S + px_x) * 4;
      px[off] = r; px[off+1] = g; px[off+2] = b; px[off+3] = a;
    }
  }
}

function roundedRect(px, S, x, y, w, h, rad, r, g, b) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    let inside = true;
    // Check corners
    for (const [cx, cy] of [[x,y],[x+w,y],[x,y+h],[x+w,y+h]]) {
      const ax = x + dx, ay = y + dy;
      if (Math.abs(ax - cx) < rad && Math.abs(ay - cy) < rad) {
        const ddx = cx === x ? rad - (ax - x) - 0.5 : (ax - (cx - rad)) + 0.5;
        const ddy = cy === y ? rad - (ay - y) - 0.5 : (ay - (cy - rad)) + 0.5;
        if (ddx > 0 && ddy > 0 && ddx*ddx + ddy*ddy > rad*rad) inside = false;
      }
    }
    if (inside) {
      const px_x = x + dx, px_y = y + dy;
      if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
        const off = (px_y * S + px_x) * 4;
        px[off] = r; px[off+1] = g; px[off+2] = b; px[off+3] = 255;
      }
    }
  }
}

function drawShape(px, S, shape, ox, oy, scale, r, g, b) {
  for (let dy = 0; dy < shape.length; dy++) {
    const row = shape[dy];
    for (let dx = 0; dx < row.length; dx++) {
      if (row[dx]) {
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const px_x = ox + dx * scale + sx, px_y = oy + dy * scale + sy;
          if (px_x >= 0 && px_x < S && px_y >= 0 && px_y < S) {
            const off = (px_y * S + px_x) * 4;
            px[off] = r; px[off+1] = g; px[off+2] = b; px[off+3] = 255;
          }
        }
      }
    }
  }
}

function drawShapeCentered(px, S, shape, cy, scale, r, g, b) {
  const sw = shape[0].length * scale, sh = shape.length * scale;
  drawShape(px, S, shape, Math.floor((S - sw) / 2), Math.floor(cy - sh / 2), scale, r, g, b);
}

// ── Pixel-art icon shapes ─────────────────────────────────────────────────────
const SHAPES = {
  battery: [
    [0,1,1,1,1,1,1,1,1,1,0,0],
    [1,0,0,0,0,0,0,0,0,1,0,0],
    [1,0,0,0,0,0,0,0,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,0,0],
  ],
  bolt: [
    [0,0,0,0,1,1,1],
    [0,0,0,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,1,1,1,0,0,0],
    [1,1,1,1,1,1,1],
    [0,0,0,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,1,1,1,0,0,0],
    [1,1,1,0,0,0,0],
  ],
  wifi: [
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,1,1,0,0,0,0,0,1,1,0],
    [1,0,0,0,0,0,0,0,0,0,1],
    [0,0,0,1,1,1,1,1,0,0,0],
    [0,0,1,0,0,0,0,0,1,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,0,0,0,0,0],
  ],
  alert: [
    [0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,1,0,1,0,0,0,0],
    [0,0,0,1,1,0,1,1,0,0,0],
    [0,0,0,1,0,0,0,1,0,0,0],
    [0,0,1,1,0,1,0,1,1,0,0],
    [0,0,1,0,0,1,0,0,1,0,0],
    [0,1,1,0,0,0,0,0,1,1,0],
    [0,1,0,0,0,1,0,0,0,1,0],
    [1,1,1,1,1,1,1,1,1,1,1],
  ],
  power: [
    [0,0,0,1,1,0,0,0],
    [0,1,0,1,1,0,1,0],
    [1,1,0,0,0,0,1,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1],
    [1,1,0,0,0,0,1,1],
    [0,1,1,0,0,1,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  health: [
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,0,1,1,1,1,0,0],
    [0,0,1,1,1,1,0,0],
  ],
};

// ── Action definitions ────────────────────────────────────────────────────────
const ACTIONS = [
  { name: "battery",     shape: "battery", keyBg: "#0d6e0d" },
  { name: "power",       shape: "bolt",    keyBg: "#1e3a5f" },
  { name: "network",     shape: "wifi",    keyBg: "#0d5a5a" },
  { name: "events",      shape: "alert",   keyBg: "#8a3d00" },
  { name: "system",      shape: "power",   keyBg: "#1a1a2e" },
  { name: "diagnostics", shape: "health",  keyBg: "#0d3d7a" },
];

// ── Output directories ────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, "..", "imgs");

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function writeIcon(filePath, size, px) {
  fs.writeFileSync(filePath, encodePNG(size, px));
}

// ── Clean up old flat icon structure ──────────────────────────────────────────
function cleanOldIcons() {
  const oldFiles = [
    "plugin.png", "plugin@2x.png", "category.png", "category@2x.png",
    "act-battery.png", "act-battery@2x.png", "act-power.png", "act-power@2x.png",
    "act-network.png", "act-network@2x.png", "act-events.png", "act-events@2x.png",
    "act-system.png", "act-system@2x.png", "act-diag.png", "act-diag@2x.png",
  ];
  for (const f of oldFiles) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  [DEL] imgs/${f}`); }
  }
}

// ── Generate action icons ─────────────────────────────────────────────────────
function generateActionIcons() {
  for (const { name, shape: shapeName, keyBg } of ACTIONS) {
    const dir = path.join(ROOT, "actions", name);
    ensureDir(dir);
    const shape = SHAPES[shapeName];
    const sw = shape[0].length, sh = shape.length;

    // icon.png — 20×20 white on transparent
    {
      const S = 20;
      const px = new Uint8Array(S * S * 4); // all zeros = transparent
      const scale = 1;
      const ox = Math.floor((S - sw * scale) / 2);
      const oy = Math.floor((S - sh * scale) / 2);
      drawShape(px, S, shape, ox, oy, scale, 255, 255, 255);
      writeIcon(path.join(dir, "icon.png"), S, px);
    }

    // icon@2x.png — 40×40 white on transparent
    {
      const S = 40;
      const px = new Uint8Array(S * S * 4);
      const scale = 2;
      const ox = Math.floor((S - sw * scale) / 2);
      const oy = Math.floor((S - sh * scale) / 2);
      drawShape(px, S, shape, ox, oy, scale, 255, 255, 255);
      writeIcon(path.join(dir, "icon@2x.png"), S, px);
    }

    // key.png — 72×72 colored background with white icon
    {
      const S = 72;
      const px = new Uint8Array(S * S * 4);
      const [br, bg_g, bb] = parseHex(keyBg);
      // Fill background
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const off = (y * S + x) * 4;
        px[off] = br; px[off+1] = bg_g; px[off+2] = bb; px[off+3] = 255;
      }
      const scale = 3;
      const ox = Math.floor((S - sw * scale) / 2);
      const oy = Math.floor((S - sh * scale) / 2);
      drawShape(px, S, shape, ox, oy, scale, 255, 255, 255);
      writeIcon(path.join(dir, "key.png"), S, px);
    }

    // key@2x.png — 144×144 colored background with white icon
    {
      const S = 144;
      const px = new Uint8Array(S * S * 4);
      const [br, bg_g, bb] = parseHex(keyBg);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const off = (y * S + x) * 4;
        px[off] = br; px[off+1] = bg_g; px[off+2] = bb; px[off+3] = 255;
      }
      const scale = 6;
      const ox = Math.floor((S - sw * scale) / 2);
      const oy = Math.floor((S - sh * scale) / 2);
      drawShape(px, S, shape, ox, oy, scale, 255, 255, 255);
      writeIcon(path.join(dir, "key@2x.png"), S, px);
    }

    console.log(`  [OK] imgs/actions/${name}/  (icon + key, @1x + @2x)`);
  }
}

// ── Generate plugin icons ─────────────────────────────────────────────────────
function generatePluginIcons() {
  const dir = path.join(ROOT, "plugin");
  ensureDir(dir);

  // category-icon.png — 28×28 white battery on transparent
  {
    const S = 28;
    const px = new Uint8Array(S * S * 4);
    drawShapeCentered(px, S, SHAPES.battery, S/2, 2, 255, 255, 255);
    writeIcon(path.join(dir, "category-icon.png"), S, px);
  }

  // category-icon@2x.png — 56×56
  {
    const S = 56;
    const px = new Uint8Array(S * S * 4);
    drawShapeCentered(px, S, SHAPES.battery, S/2, 4, 255, 255, 255);
    writeIcon(path.join(dir, "category-icon@2x.png"), S, px);
  }

  // marketplace.png — 288×288 branded icon
  {
    const S = 288;
    const px = new Uint8Array(S * S * 4);
    // Dark rounded-rect background
    roundedRect(px, S, 0, 0, S, S, 32, 13, 17, 23); // #0d1117
    // Large battery shape, white
    const bat = SHAPES.battery;
    const batScale = 16;
    const batW = bat[0].length * batScale, batH = bat.length * batScale;
    const bx = Math.floor((S - batW) / 2), by = Math.floor((S - batH) / 2) - 10;
    drawShape(px, S, bat, bx, by, batScale, 255, 255, 255);
    // Bolt inside battery, yellow
    const bolt = SHAPES.bolt;
    const boltScale = 8;
    const boltW = bolt[0].length * boltScale, boltH = bolt.length * boltScale;
    const blx = Math.floor((S - boltW) / 2), bly = Math.floor((S - boltH) / 2) - 10;
    drawShape(px, S, bolt, blx, bly, boltScale, 255, 221, 68); // #ffdd44
    // "LPUPS" text at bottom — simple block letters
    // (keeping it icon-only for clean look)
    writeIcon(path.join(dir, "marketplace.png"), S, px);
  }

  // marketplace@2x.png — 576×576
  {
    const S = 576;
    const px = new Uint8Array(S * S * 4);
    roundedRect(px, S, 0, 0, S, S, 64, 13, 17, 23);
    const bat = SHAPES.battery;
    const batScale = 32;
    const batW = bat[0].length * batScale, batH = bat.length * batScale;
    const bx = Math.floor((S - batW) / 2), by = Math.floor((S - batH) / 2) - 20;
    drawShape(px, S, bat, bx, by, batScale, 255, 255, 255);
    const bolt = SHAPES.bolt;
    const boltScale = 16;
    const boltW = bolt[0].length * boltScale, boltH = bolt.length * boltScale;
    const blx = Math.floor((S - boltW) / 2), bly = Math.floor((S - boltH) / 2) - 20;
    drawShape(px, S, bolt, blx, bly, boltScale, 255, 221, 68);
    writeIcon(path.join(dir, "marketplace@2x.png"), S, px);
  }

  console.log("  [OK] imgs/plugin/  (marketplace + category-icon, @1x + @2x)");
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("Generating icons (Elgato SDK standard)...");
ensureDir(ROOT);
cleanOldIcons();
generateActionIcons();
generatePluginIcons();
console.log("Done.");
