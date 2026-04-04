import React, { useState } from "react";
import Dashboard   from "./components/Dashboard";
import Diagnostics from "./components/Diagnostics";

type View = "dashboard" | "diagnostics";

export default function App(): React.ReactElement {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="flex flex-col w-full h-full bg-[#0d1117]">
      {/* ── Nav bar ──────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-0 border-b border-[#21262d] flex-shrink-0">
        <span className="px-4 py-2 text-[10px] text-[#58a6ff] font-bold tracking-widest uppercase">
          LPUPS
        </span>
        <div className="flex-1" />
        {(["dashboard", "diagnostics"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`
              px-5 py-2 text-[11px] uppercase tracking-widest font-semibold
              transition-colors border-b-2
              ${view === v
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
              }
            `}
          >
            {v}
          </button>
        ))}
      </nav>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {view === "dashboard"   && <Dashboard   onRunDiag={() => setView("diagnostics")} />}
        {view === "diagnostics" && <Diagnostics onBack={() => setView("dashboard")} />}
      </div>
    </div>
  );
}
