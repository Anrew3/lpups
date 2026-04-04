import React, { useState, useEffect } from "react";

type NetMode = "WIFI" | "CELLULAR" | "ERROR" | "LOADING";

export default function NetworkCard(): React.ReactElement {
  const [mode,    setMode]    = useState<NetMode>("LOADING");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    window.lpups.getNetwork().then((m) => setMode(m as NetMode)).catch(() => setMode("ERROR"));
  }, []);

  async function toggle(): Promise<void> {
    if (working) return;
    setWorking(true);
    const target = mode === "WIFI" ? "cellular" : "wifi";
    const result = await window.lpups.setNetwork(target).catch(() => "ERROR" as const);
    setMode(result as NetMode);
    setWorking(false);
  }

  const isWifi = mode === "WIFI";
  const label  = mode === "LOADING" ? "…" : mode;
  const color  = isWifi ? "#58a6ff" : "#3fb950";

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
        Network Priority
      </span>

      <div className="flex items-center justify-between">
        <span className="text-2xl font-bold" style={{ color }}>
          {label}
        </span>
        <button
          onClick={toggle}
          disabled={working || mode === "ERROR" || mode === "LOADING"}
          className={`
            px-3 py-1 rounded text-[11px] font-semibold border transition-colors
            ${working
              ? "border-[#30363d] text-[#6e7681] cursor-wait"
              : "border-[#30363d] text-[#c9d1d9] hover:border-[#58a6ff] hover:text-[#58a6ff] cursor-pointer"
            }
          `}
        >
          {working ? "…" : (isWifi ? "Switch → Cellular" : "Switch → WiFi")}
        </button>
      </div>

      <div className="flex gap-3 text-[10px] text-[#8b949e]">
        <span className={isWifi ? "text-[#58a6ff]" : ""}>WiFi  metric={isWifi ? 10 : 100}</span>
        <span className={!isWifi ? "text-[#3fb950]" : ""}>Cell  metric={!isWifi ? 5 : 50}</span>
      </div>
    </div>
  );
}
