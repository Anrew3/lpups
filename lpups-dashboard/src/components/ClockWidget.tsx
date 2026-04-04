import React, { useState, useEffect } from "react";

function pad(n: number): string { return n.toString().padStart(2, "0"); }

export default function ClockWidget(): React.ReactElement {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const h  = pad(now.getHours());
  const m  = pad(now.getMinutes());
  const s  = pad(now.getSeconds());
  const mo = now.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const d  = pad(now.getDate());
  const yr = now.getFullYear();

  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="text-2xl font-bold text-[#c9d1d9] tracking-widest tabular-nums">
        {h}<span className="text-[#58a6ff] animate-pulse">:</span>{m}<span className="text-[#58a6ff] opacity-50">:</span>
        <span className="text-base text-[#8b949e]">{s}</span>
      </div>
      <div className="text-[10px] text-[#6e7681] tracking-widest mt-0.5">
        {mo} {d}, {yr}
      </div>
    </div>
  );
}
