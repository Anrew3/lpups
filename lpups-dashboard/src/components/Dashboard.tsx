import React from "react";
import { useUPS }          from "../hooks/useUPS";
import { B1Card, B2Card }  from "./BatteryCard";
import NetworkCard          from "./NetworkCard";
import EventLog             from "./EventLog";
import SystemControl        from "./SystemControl";
import PowerSparkline       from "./PowerSparkline";
import ClockWidget          from "./ClockWidget";

interface Props { onRunDiag: () => void }

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {connected && (
          <div className="absolute inset-0 rounded-full bg-[#3fb950] status-ping" />
        )}
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-[#3fb950]" : "bg-[#f85149]"}`} />
      </div>
      <span className={`text-[9px] uppercase tracking-widest font-semibold
        ${connected ? "text-[#3fb950]" : "text-[#f85149]"}`}>
        {connected ? "Arduino Online" : "No Signal"}
      </span>
    </div>
  );
}

export default function Dashboard({ onRunDiag }: Props): React.ReactElement {
  const { data, events, powerHistory } = useUPS();

  return (
    <div className="flex flex-col h-full p-2 gap-2">

      {/* ── Row 1: Status + Batteries ─────────────────────────────────── */}
      <div className="flex gap-2 flex-shrink-0" style={{ height: "260px" }}>

        {/* B1 */}
        <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex-1">
          <B1Card b1={data.b1} />
        </div>

        {/* B2 */}
        <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex-1">
          <B2Card b2={data.b2} />
        </div>

        {/* Right column: status + clock + network + system */}
        <div className="flex flex-col gap-2 w-[200px]">
          {/* Connection */}
          <div className="rounded-lg bg-[#161b22] border border-[#30363d] px-3 py-2 flex items-center justify-between">
            <ConnectionBadge connected={data.connected} />
            <span className="text-[9px] text-[#484f58]">v1.1</span>
          </div>

          <ClockWidget />

          <div className="flex-1 flex flex-col gap-2">
            <NetworkCard />
          </div>
        </div>
      </div>

      {/* ── Row 2: Power history + Events + Controls ──────────────────── */}
      <div className="flex gap-2 flex-1 min-h-0">

        {/* Power sparkline */}
        <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-1" style={{ minWidth: 0, flex: 2 }}>
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold flex-shrink-0">
            Power Draw History
          </span>
          <div className="flex-1 flex flex-col justify-center">
            <PowerSparkline history={powerHistory} width={380} height={72} color="#58a6ff" />
            {data.b2.present && (
              <div className="flex gap-4 text-[10px] mt-1 px-1 text-[#8b949e]">
                <span>Avg 5m: <span className="text-[#c9d1d9]">{data.b2.avgCurrentMA} mA</span></span>
                <span>Runtime: <span className="text-[#c9d1d9]">
                  {data.b2.runtimeMins > 0
                    ? `${Math.floor(data.b2.runtimeMins / 60)}h ${data.b2.runtimeMins % 60}m`
                    : "—"}
                </span></span>
              </div>
            )}
          </div>
        </div>

        {/* Event log */}
        <div className="flex-1 min-h-0 min-w-0">
          <EventLog events={events} />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 w-[200px]">
          <SystemControl />
          <button
            onClick={onRunDiag}
            className="w-full py-2 rounded-lg border border-[#30363d] text-[#8b949e] text-[10px] uppercase tracking-widest font-semibold hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff0a] transition-all"
          >
            Run Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}
