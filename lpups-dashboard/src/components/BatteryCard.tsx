import React from "react";
import type { B1Data, B2Data } from "../../electron/types";

// ── helpers ──────────────────────────────────────────────────────────────────
function pctColor(pct: number): string {
  if (pct >= 60) return "#3fb950";
  if (pct >= 30) return "#d29922";
  if (pct >= 15) return "#f0883e";
  return "#f85149";
}

function Bar({ pct, color }: { pct: number; color: string }): React.ReactElement {
  return (
    <div className="bar-track h-2 w-full mt-1">
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex justify-between text-[11px] py-[2px]">
      <span className="text-[#8b949e]">{label}</span>
      <span className="text-[#e6edf3]">{value}</span>
    </div>
  );
}

// ── B1 card ───────────────────────────────────────────────────────────────────
interface B1Props { b1: B1Data }

export function B1Card({ b1 }: B1Props): React.ReactElement {
  const color = pctColor(b1.capacity);
  const currentDir = b1.current < 0 ? "↓ discharging" : "↑ charging";
  const absCurrent = Math.abs(b1.current);

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
          18650 UPS Pack
        </span>
        <div className="flex items-center gap-2">
          {b1.acPresent && (
            <span className="text-[10px] text-[#58a6ff]">⚡ AC</span>
          )}
          {b1.charging && (
            <span className="text-[10px] text-[#3fb950]">CHG</span>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color }}>{b1.capacity}%</span>
        <span className="text-[11px] text-[#8b949e] mb-1">{(b1.voltage / 1000).toFixed(2)} V</span>
      </div>
      <Bar pct={b1.capacity} color={color} />

      <div className="mt-2 flex flex-col gap-0">
        <Row label="Current"     value={`${absCurrent} mA  ${currentDir}`} />
        <Row label="Temperature" value={`${b1.temperature} °C`} />
      </div>
    </div>
  );
}

// ── B2 card ───────────────────────────────────────────────────────────────────
interface B2Props { b2: B2Data }

export function B2Card({ b2 }: B2Props): React.ReactElement {
  if (!b2.present) {
    return (
      <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
          12V LiON Pack
        </span>
        <span className="text-[#6e7681] text-sm mt-2">Not detected</span>
      </div>
    );
  }

  const color = pctColor(b2.remaining);
  const runtime = b2.runtimeMins > 0
    ? `${Math.floor(b2.runtimeMins / 60)}h ${b2.runtimeMins % 60}m`
    : "—";

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
          12V LiON Pack
        </span>
        {b2.charging && (
          <span className="text-[10px] text-[#3fb950]">⚡ CHARGING</span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color }}>{b2.remaining}%</span>
        <span className="text-[11px] text-[#8b949e] mb-1">{(b2.voltage / 1000).toFixed(2)} V</span>
      </div>
      <Bar pct={b2.remaining} color={color} />

      <div className="mt-2 flex flex-col gap-0">
        <Row label="Draw"        value={`${b2.powerDrawW} W  /  ${b2.avgCurrentMA} mA avg`} />
        <Row label="Est runtime" value={runtime} />
      </div>
    </div>
  );
}
