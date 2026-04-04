#!/usr/bin/env node
/**
 * generate-icons.js
 * Creates placeholder 72×72 and 144×144 PNG icons for the Stream Deck plugin.
 * Pure Node.js — zero external dependencies.
 * Run automatically via "prebuild" in package.json.
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

// ── PNG chunk ──────────────────────────────────────────────────────────────────
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, c]);
}

// ── Build PNG ─────────────────────────────────────────────────────────────────
function makePNG(size, hex, label) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB

  // Raw pixels: filter byte + RGB per pixel per row
  const row = 1 + size * 3;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const o = y * row + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }

  const SIG  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const IHDR = chunk("IHDR", ihdrData);
  const IDAT = chunk("IDAT", zlib.deflateSync(raw));
  const IEND = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([SIG, IHDR, IDAT, IEND]);
}

// ── Icons: name → background colour ──────────────────────────────────────────
const ICONS = {
  "plugin":      { color: "#0d1117", label: "LPUPS" },
  "category":    { color: "#0d1117", label: "LPUPS" },
  "act-battery": { color: "#0d3d1a", label: "BAT"   },
  "act-power":   { color: "#0d1a3d", label: "PWR"   },
  "act-network": { color: "#1a0d3d", label: "NET"   },
  "act-events":  { color: "#3d1a0d", label: "EVT"   },
  "act-system":  { color: "#3d0d0d", label: "SYS"   },
  "act-diag":    { color: "#0d2a3d", label: "DIAG"  },
};

const OUT = path.join(__dirname, "..", "imgs");
fs.mkdirSync(OUT, { recursive: true });

for (const [name, { color, label }] of Object.entries(ICONS)) {
  fs.writeFileSync(path.join(OUT, `${name}.png`),    makePNG(72,  color, label));
  fs.writeFileSync(path.join(OUT, `${name}@2x.png`), makePNG(144, color, label));
  console.log(`  [OK] imgs/${name}.png`);
}
console.log("Icons generated.");
