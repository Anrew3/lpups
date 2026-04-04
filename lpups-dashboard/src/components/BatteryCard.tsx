import React from "react";
import CircularGauge from "./CircularGauge";
import type { B1Data, B2Data } from "../../electron/types";

export function pctColor(pct: number): string {
  if (pct >= 60) return "#3fb950";
  if (pct >= 30) return "#d29922";
  if (pct >= 15) return "#f0883e";
  return "#f85149";
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center text-[10px] py-[3px] border-b border-[#21262d] last:border-0">
      <span className="text-[#6e7681] uppercase tracking-wider">{label}</span>
      <span style={accent ? { color: accent } : undefined} className="text-[#c9d1d9] font-semibold">
        {value}
      </span>
    </div>
  );
}

// ── B1 ────────────────────────────────────────────────────────────────────────
export function B1Card({ b1 }: { b1: B1Data }): React.ReactElement {
  const color  = pctColor(b1.capacity);
  const mA     = Math.abs(b1.current);
  const dir    = b1.current < 0 ? "↓" : "↑";

  return (
    <div className="flex flex-col items-center gap-2 h-full">
      <div className="flex items-center justify-between w-full">
        <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold">
          18650 UPS Pack
        </span>
        <div className="flex gap-1.5">
          {b1.acPresent && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#58a6ff20] text-[#58a6ff] border border-[#58a6ff40]">
              AC
            </span>
          )}
          {b1.charging && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040] bolt-pulse">
              CHG
            </span>
          )}
        </div>
      </div>

      <CircularGauge
        pct={b1.capacity}
        color={color}
        size={130}
        sublabel={`${(b1.voltage / 1000).toFixed(2)}V`}
        charging={b1.charging}
      />

      <div className="w-full flex flex-col">
        <Stat label="Current"  value={`${mA} mA ${dir}`} />
        <Stat label="Temp"     value={`${b1.temperature}°C`}
              accent={b1.temperature > 40 ? "#f0883e" : undefined} />
      </div>
    </div>
  );
}

// ── B2 ────────────────────────────────────────────────────────────────────────
export function B2Card({ b2 }: { b2: B2Data }): React.ReactElement {
  if (!b2.present) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold w-full">
          12V LiON Pack
        </span>
        <div className="flex flex-col items-center justify-center flex-1 gap-1">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#30363d] flex items-center justify-center shimmer">
            <span className="text-[#6e7681] text-lg">?</span>
          </div>
          <span className="text-[10px] text-[#6e7681]">Not detected</span>
        </div>
      </div>
    );
  }

  const color   = pctColor(b2.remaining);
  const runtime = b2.runtimeMins > 0
    ? `${Math.floor(b2.runtimeMins / 60)}h ${b2.runtimeMins % 60}m`
    : "—";

  return (
    <div className="flex flex-col items-center gap-2 h-full">
      <div className="flex items-center justify-between w-full">
        <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold">
          12V LiON Pack
        </span>
        {b2.charging && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040] bolt-pulse">
            ⚡ CHARGING
          </span>
        )}
      </div>

      <CircularGauge
        pct={b2.remaining}
        color={color}
        size={130}
        sublabel={`${(b2.voltage / 1000).toFixed(2)}V`}
        charging={b2.charging}
      />

      <div className="w-full flex flex-col">
        <Stat label="Draw"    value={`${b2.powerDrawW}W`} />
        <Stat label="Runtime" value={runtime}
              accent={b2.runtimeMins < 30 && b2.runtimeMins > 0 ? "#f85149" : undefined} />
      </div>
    </div>
  );
}
