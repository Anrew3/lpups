import React, { useState } from "react";
import Dashboard   from "./components/Dashboard";
import Diagnostics from "./components/Diagnostics";

type View = "dashboard" | "diagnostics";

export default function App(): React.ReactElement {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="flex flex-col w-full h-full bg-[#0d1117]">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="flex items-center px-3 border-b border-[#21262d] flex-shrink-0" style={{ height: "32px" }}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-4">
          <div className="w-2 h-2 rounded-sm bg-[#58a6ff]" style={{ boxShadow: "0 0 6px #58a6ff" }} />
          <span className="text-[10px] font-bold tracking-[0.3em] text-[#58a6ff] uppercase">LPUPS</span>
        </div>

        <div className="flex-1" />

        {/* Nav buttons */}
        {(["dashboard", "diagnostics"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 h-full text-[10px] uppercase tracking-widest font-semibold border-b-2 transition-all
              ${view === v
                ? "border-[#58a6ff] text-[#58a6ff]"
                : "border-transparent text-[#484f58] hover:text-[#8b949e]"
              }`}>
            {v}
          </button>
        ))}

        {/* Minimize to tray */}
        <button
          onClick={() => window.lpups.hideWindow()}
          className="ml-2 w-6 h-6 flex items-center justify-center text-[#484f58] hover:text-[#8b949e] transition-colors text-sm"
          title="Minimize to tray"
        >
          —
        </button>
      </nav>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {view === "dashboard"   && <Dashboard   onRunDiag={() => setView("diagnostics")} />}
        {view === "diagnostics" && <Diagnostics onBack={()  => setView("dashboard")}    />}
      </div>
    </div>
  );
}
