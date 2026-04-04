import React, { useState, useEffect } from "react";

type NetMode = "WIFI" | "CELLULAR" | "ERROR" | "LOADING";

export default function NetworkCard(): React.ReactElement {
  const [mode,    setMode]    = useState<NetMode>("LOADING");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    window.lpups.getNetwork().then((m) => setMode(m as NetMode)).catch(() => setMode("ERROR"));
  }, []);

  async function toggle() {
    if (working || mode === "LOADING" || mode === "ERROR") return;
    setWorking(true);
    const target = mode === "WIFI" ? "cellular" : "wifi";
    const result = await window.lpups.setNetwork(target).catch(() => "ERROR" as const);
    setMode(result as NetMode);
    setWorking(false);
  }

  const isWifi  = mode === "WIFI";
  const isCellular = mode === "CELLULAR";
  const ready   = !working && mode !== "LOADING" && mode !== "ERROR";

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-2">
      <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold">
        Network Priority
      </span>

      <div className="flex flex-col gap-1.5">
        {/* WiFi row */}
        <div className={`flex items-center justify-between px-2 py-1.5 rounded border transition-all
          ${isWifi ? "border-[#58a6ff] bg-[#58a6ff10]" : "border-[#30363d] opacity-50"}`}>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">📶</span>
            <span className="text-[10px] font-semibold text-[#c9d1d9]">Wi-Fi</span>
          </div>
          <span className="text-[9px] text-[#6e7681]">metric {isWifi ? 10 : 100}</span>
        </div>

        {/* Cellular row */}
        <div className={`flex items-center justify-between px-2 py-1.5 rounded border transition-all
          ${isCellular ? "border-[#3fb950] bg-[#3fb95010]" : "border-[#30363d] opacity-50"}`}>
          <div className="flex items-center gap-2">
            <span className="text-[11px]">📡</span>
            <span className="text-[10px] font-semibold text-[#c9d1d9]">Cellular</span>
          </div>
          <span className="text-[9px] text-[#6e7681]">metric {isCellular ? 5 : 50}</span>
        </div>
      </div>

      <button
        onClick={toggle}
        disabled={!ready}
        className={`w-full py-1.5 rounded text-[10px] font-semibold border transition-all
          ${ready
            ? "border-[#30363d] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[#58a6ff0a] cursor-pointer"
            : "border-[#21262d] text-[#484f58] cursor-not-allowed"
          }`}
      >
        {working ? "Switching…" : mode === "LOADING" ? "Loading…" : `Switch to ${isWifi ? "Cellular" : "Wi-Fi"}`}
      </button>
    </div>
  );
}
