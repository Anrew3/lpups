import React, { useRef, useEffect } from "react";

export default function EventLog({ events }: { events: string[] }): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length]);

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between flex-shrink-0 mb-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-[#6e7681] font-semibold">
          Arduino Events
        </span>
        {events.length > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#f0883e20] text-[#f0883e] border border-[#f0883e40]">
            {events.length}
          </span>
        )}
      </div>

      <div className="panel-scroll flex-1 flex flex-col gap-0.5 text-[10px]">
        {events.length === 0 ? (
          <span className="text-[#484f58] shimmer">Waiting for events…</span>
        ) : (
          events.map((e, i) => (
            <div key={i}
              className={`py-[2px] px-1.5 rounded flex items-start gap-1.5 leading-4
                ${i === 0 ? "bg-[#f0883e0d] text-[#f0883e]" : "text-[#6e7681]"}`}>
              <span className={`flex-shrink-0 mt-0.5 ${i === 0 ? "text-[#f0883e]" : "text-[#484f58]"}`}>›</span>
              <span>{e}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
