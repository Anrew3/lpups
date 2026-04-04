import React, { useState } from "react";

type Step = "idle" | "confirm-shutdown" | "confirm-restart" | "executing";

export default function SystemControl(): React.ReactElement {
  const [step,  setStep]  = useState<Step>("idle");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  function arm(action: "confirm-shutdown" | "confirm-restart") {
    setStep(action);
    const t = setTimeout(() => setStep("idle"), 5000);
    setTimer(t);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    setStep("idle");
  }

  function execute(action: "shutdown" | "restart") {
    if (timer) clearTimeout(timer);
    setStep("executing");
    if (action === "shutdown") window.lpups.shutdown();
    else                       window.lpups.restart();
  }

  if (step === "executing") {
    return (
      <div className="rounded-lg bg-[#f851491a] border border-[#f85149] p-3 text-center">
        <div className="text-[#f85149] font-bold text-[11px] uppercase tracking-widest shimmer">
          Command Sent…
        </div>
      </div>
    );
  }

  if (step === "confirm-shutdown") {
    return (
      <div className="rounded-lg bg-[#f851491a] border border-[#f85149] p-3 flex flex-col gap-2 slide-in">
        <span className="text-[9px] text-[#f85149] font-bold uppercase tracking-widest">
          Confirm — 30s delay
        </span>
        <div className="flex gap-2">
          <button onClick={() => execute("shutdown")}
            className="flex-1 bg-[#f85149] text-white rounded py-1.5 text-[10px] font-bold hover:bg-[#ff6b6b] transition-colors">
            Confirm
          </button>
          <button onClick={cancel}
            className="flex-1 border border-[#30363d] text-[#8b949e] rounded py-1.5 text-[10px] hover:border-[#6e7681] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirm-restart") {
    return (
      <div className="rounded-lg bg-[#f0883e1a] border border-[#f0883e] p-3 flex flex-col gap-2 slide-in">
        <span className="text-[9px] text-[#f0883e] font-bold uppercase tracking-widest">
          Confirm — 10s delay
        </span>
        <div className="flex gap-2">
          <button onClick={() => execute("restart")}
            className="flex-1 bg-[#f0883e] text-white rounded py-1.5 text-[10px] font-bold hover:bg-[#ffaa55] transition-colors">
            Confirm
          </button>
          <button onClick={cancel}
            className="flex-1 border border-[#30363d] text-[#8b949e] rounded py-1.5 text-[10px] hover:border-[#6e7681] transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-2">
      <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold">
        System Control
      </span>
      <div className="flex gap-2">
        <button onClick={() => arm("confirm-shutdown")}
          className="flex-1 border border-[#f8514960] text-[#f85149] rounded py-1.5 text-[10px] font-semibold hover:bg-[#f851491a] hover:border-[#f85149] transition-all">
          ⏻ Shutdown
        </button>
        <button onClick={() => arm("confirm-restart")}
          className="flex-1 border border-[#f0883e60] text-[#f0883e] rounded py-1.5 text-[10px] font-semibold hover:bg-[#f0883e1a] hover:border-[#f0883e] transition-all">
          ↺ Restart
        </button>
      </div>
    </div>
  );
}
