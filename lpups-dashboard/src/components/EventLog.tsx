import React, { useRef, useEffect } from "react";

interface Props {
  events: string[];
}

export default function EventLog({ events }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-3 flex flex-col gap-1 h-full">
      <span className="text-[10px] uppercase tracking-widest text-[#8b949e] font-semibold flex-shrink-0">
        Arduino Events
      </span>

      <div className="panel-scroll flex-1 mt-1 text-[11px] leading-5">
        {events.length === 0 ? (
          <span className="text-[#6e7681]">No events yet…</span>
        ) : (
          [...events].reverse().map((e, i) => (
            <div key={i} className={`py-[1px] ${i === 0 ? "text-[#f0883e]" : "text-[#8b949e]"}`}>
              {e}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
