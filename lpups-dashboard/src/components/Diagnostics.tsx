import React, { useState, useEffect, useRef } from "react";
import type { DiagCheck, DiagResult } from "../../electron/types";

const CHECK_NAMES = [
  "Arduino Serial",
  "B1 UPS Capacity",
  "B2 12V Pack",
  "WiFi Adapter",
  "Cellular Adapter",
  "Internet (1.1.1.1)",
  "Tailscale Service",
  "Tailscale IP",
  "RDP Registry",
  "RDP Service",
  "RDP Firewall",
  "Drive Health",
  "Disk Free Space",
  "Sleep Disabled",
  "Auto-Login",
];

function statusColor(s: string): string {
  switch (s) {
    case "PASS":    return "#3fb950";
    case "WARN":    return "#d29922";
    case "FAIL":    return "#f85149";
    case "RUNNING": return "#58a6ff";
    default:        return "#6e7681";
  }
}

function statusIcon(s: string): string {
  switch (s) {
    case "PASS":    return "✓";
    case "WARN":    return "⚠";
    case "FAIL":    return "✗";
    case "RUNNING": return "◌";
    default:        return "·";
  }
}

function Spinner(): React.ReactElement {
  const frames = ["◐", "◓", "◑", "◒"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((p) => (p + 1) % frames.length), 160);
    return () => clearInterval(t);
  }, []);
  return <span className="text-[#58a6ff]">{frames[i]}</span>;
}

interface CheckRowProps {
  check: DiagCheck;
  index: number;
}

function CheckRow({ check, index }: CheckRowProps): React.ReactElement {
  const color = statusColor(check.status);
  const icon  = statusIcon(check.status);
  return (
    <div
      className="grid gap-x-3 py-[3px] text-[11px] items-center"
      style={{ gridTemplateColumns: "1.5rem 1fr 1fr" }}
    >
      <span style={{ color }} className="font-bold text-center">
        {check.status === "RUNNING" ? <Spinner /> : icon}
      </span>
      <span className="text-[#c9d1d9] truncate">{check.name || CHECK_NAMES[index] || `Check ${index + 1}`}</span>
      <span className="text-[#8b949e] truncate">{check.detail}</span>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

type RunState = "idle" | "running" | "done";

export default function Diagnostics({ onBack }: Props): React.ReactElement {
  const [runState, setRunState] = useState<RunState>("idle");
  const [checks,   setChecks]   = useState<DiagCheck[]>([]);
  const [result,   setResult]   = useState<DiagResult | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubCheck = window.lpups.onDiagCheck((c) => {
      setChecks((prev) => [...prev, c]);
      // Auto-scroll
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    const unsubDone = window.lpups.onDiagDone((r) => {
      setResult(r);
      setRunState("done");
    });
    return () => {
      unsubCheck();
      unsubDone();
    };
  }, []);

  function run(): void {
    setChecks([]);
    setResult(null);
    setRunState("running");
    window.lpups.runDiagnostics();
  }

  // Auto-run when first opened
  const hasRun = useRef(false);
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      run();
    }
  }, []);

  // Pending placeholders while running
  const pendingCount = Math.max(0, 15 - checks.length);
  const pendingPlaceholders: DiagCheck[] = runState === "running"
    ? Array.from({ length: pendingCount }, (_, i) => ({
        status: (i === 0 ? "RUNNING" : "PENDING") as DiagCheck["status"],
        name:   CHECK_NAMES[checks.length + i] ?? `Check ${checks.length + i + 1}`,
        detail: "",
      }))
    : [];

  const allRows = [...checks, ...pendingPlaceholders];

  return (
    <div className="flex flex-col h-full p-3 gap-3">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-[10px] px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff] transition-colors"
        >
          ← Back
        </button>
        <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold flex-1">
          System Diagnostics
        </span>
        {runState !== "running" && (
          <button
            onClick={run}
            className="text-[10px] px-3 py-1 rounded border border-[#58a6ff] text-[#58a6ff] hover:bg-[#58a6ff1a] transition-colors"
          >
            {runState === "done" ? "Re-run" : "Run"}
          </button>
        )}
        {runState === "running" && (
          <span className="text-[#58a6ff] text-[10px] flex items-center gap-1">
            <Spinner /> Running…
          </span>
        )}
      </div>

      {/* ── Summary bar (shown when done) ───────────────────────────── */}
      {result && (
        <div className="flex gap-4 text-sm font-bold flex-shrink-0">
          <span className="text-[#3fb950]">{result.pass} PASS</span>
          <span className="text-[#d29922]">{result.warn} WARN</span>
          <span className="text-[#f85149]">{result.fail} FAIL</span>
        </div>
      )}

      {/* ── Check list ──────────────────────────────────────────────── */}
      <div className="flex-1 panel-scroll rounded-lg bg-[#161b22] border border-[#30363d] p-3 min-h-0">

        {/* Column headers */}
        <div
          className="grid gap-x-3 pb-2 mb-1 border-b border-[#21262d] text-[9px] uppercase tracking-widest text-[#6e7681]"
          style={{ gridTemplateColumns: "1.5rem 1fr 1fr" }}
        >
          <span />
          <span>Check</span>
          <span>Detail</span>
        </div>

        {allRows.map((c, i) => <CheckRow key={i} check={c} index={i} />)}

        {runState === "idle" && checks.length === 0 && (
          <div className="text-[#6e7681] text-sm mt-4 text-center">
            Tap "Run" to start the 15-point sanity check.
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
