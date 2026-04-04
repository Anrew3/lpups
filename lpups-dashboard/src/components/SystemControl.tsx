import React, { useState } from "react";

type Step = "idle" | "confirm-shutdown" | "confirm-restart" | "executing";

export default function SystemControl(): React.ReactElement {
  const [step,  setStep]  = useState<Step>("idle");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function arm(action: "confirm-shutdown" | "confirm-restart"): void {
    setStep(action);
    const t = setTimeout(() => setStep("idle"), 5000);
    setTimer(t);
  }

  function cancel(): void {
    if (timer) clearTimeout(timer);
    setStep("idle");
  }

  function execute(action: "shutdown" | "restart"): void {
    if (timer) clearTimeout(timer);
    setStep("executing");
    if (action === "shutdown") window.lpups.shutdown();
    else                       window.lpups.restart();
  }

  if (step === "executing") {
    return (
      <div className="rounded-lg bg-[#f851491a] border border-[#f85149] p-3 text-center">
        <span className="text-[#f85149] font-bold text-sm">COMMAND SENT…</span>
      </div>
    );
  }

  if (step === "confirm-shutdown") {
    return (
      <div className="rounded-lg bg-[#f851491a] border border-[#f85149] p-3 flex flex-col gap-2">
        <span className="text-[#f85149] font-bold text-[11px] uppercase tracking-widest">
          Confirm Shutdown (30 s delay)
        </span>
        <div className="flex gap-2">
          <button onClick={() => execute("shutdown")} className="flex-1 bg-[#f85149] text-white rounded py-1 text-[11px] font-bold">
            YES, SHUT DOWN
          </button>
          <button onClick={cancel} className="flex-1 border border-[#30363d] text-[#c9d1d9] rounded py-1 text-[11px]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirm-restart") {
    return (
      <div className="rounded-lg bg-[#f0883e1a] border border-[#f0883e] p-3 flex flex-col gap-2">
        <span className="text-[#f0883e] font-bold text-[11px] uppercase tracking-widest">
          Confirm Restart (10 s delay)
        </span>
        <div className="flex gap-2">
          <button onClick={() => execute("restart")} className="flex-1 bg-[#f0883e] text-white rounded py-1 text-[11px] font-bold">
            YES, RESTART
          </button>
          <button onClick={cancel} className="flex-1 border border-[#30363d] text-[#c9d1d9] rounded py-1 text-[11px]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Idle
  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold">
        System Control
      </span>
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => arm("confirm-shutdown")}
          className="flex-1 border border-[#f85149] text-[#f85149] rounded py-1 text-[11px] font-semibold hover:bg-[#f851491a] transition-colors"
        >
          Shutdown
        </button>
        <button
          onClick={() => arm("confirm-restart")}
          className="flex-1 border border-[#f0883e] text-[#f0883e] rounded py-1 text-[11px] font-semibold hover:bg-[#f0883e1a] transition-colors"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
