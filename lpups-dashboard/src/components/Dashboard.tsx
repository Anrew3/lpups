import React from "react";
import { useUPS }      from "../hooks/useUPS";
import { B1Card, B2Card } from "./BatteryCard";
import NetworkCard      from "./NetworkCard";
import EventLog         from "./EventLog";
import SystemControl    from "./SystemControl";

interface Props {
  onRunDiag: () => void;
}

function ConnectionBadge({ connected }: { connected: boolean }): React.ReactElement {
  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest
      ${connected ? "text-[#3fb950]" : "text-[#f85149]"}`}>
      <span className={`w-2 h-2 rounded-full inline-block ${connected ? "bg-[#3fb950]" : "bg-[#f85149]"}`} />
      {connected ? "Arduino online" : "Waiting for Arduino…"}
    </div>
  );
}

export default function Dashboard({ onRunDiag }: Props): React.ReactElement {
  const { data, events } = useUPS();

  return (
    <div className="flex flex-col h-full p-3 gap-3">
      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0">
        <ConnectionBadge connected={data.connected} />
        <button
          onClick={onRunDiag}
          className="text-[10px] px-3 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff] transition-colors"
        >
          Run Diagnostics
        </button>
      </div>

      {/* ── Main grid ───────────────────────────────────────────────── */}
      {/*  Layout (1024×600 7" panel):
           [B1  |  B2 ]  top row — batteries
           [Network | Events | System]  bottom row
      */}
      <div className="flex-1 grid grid-rows-[1fr_1fr] gap-3 min-h-0">

        {/* Row 1: Batteries */}
        <div className="grid grid-cols-2 gap-3">
          <B1Card b1={data.b1} />
          <B2Card b2={data.b2} />
        </div>

        {/* Row 2: Network + Events + System */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-3">
            <NetworkCard />
            <SystemControl />
          </div>
          <div className="col-span-2">
            <EventLog events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
