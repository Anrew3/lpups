import React, { useId } from "react";

interface Props {
  history: number[];   // recent powerDrawW values
  width?:  number;
  height?: number;
  color?:  string;
}

export default function PowerSparkline({
  history, width = 400, height = 56, color = "#58a6ff",
}: Props): React.ReactElement {
  const gradId = useId();

  if (history.length < 2) {
    return (
      <div style={{ width, height }} className="flex items-center justify-center">
        <span className="text-[10px] text-[#6e7681] shimmer">Collecting data…</span>
      </div>
    );
  }

  const max    = Math.max(...history, 1);
  const min    = 0;
  const range  = max - min;
  const pad    = 4;
  const W      = width  - pad * 2;
  const H      = height - pad * 2;
  const n      = history.length;

  const pts = history.map((v, i) => {
    const x = pad + (i / (n - 1)) * W;
    const y = pad + H - ((v - min) / range) * H;
    return [x, y] as [number, number];
  });

  const polyline = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const area     = [
    `${pts[0][0]},${pad + H}`,
    ...pts.map(([x, y]) => `${x},${y}`),
    `${pts[n - 1][0]},${pad + H}`,
  ].join(" ");

  const now = history[history.length - 1];
  const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
  const peak = Math.max(...history);

  return (
    <div className="flex flex-col gap-1">
      <svg width={width} height={height} className="chart-area">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <polygon points={area} fill={`url(#${gradId})`} />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Current value dot */}
        <circle
          cx={pts[n - 1][0]}
          cy={pts[n - 1][1]}
          r={3}
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      </svg>

      {/* Stats row */}
      <div className="flex justify-between text-[9px] text-[#6e7681] px-1">
        <span>NOW  <span className="text-[#c9d1d9]">{now}W</span></span>
        <span>AVG  <span className="text-[#c9d1d9]">{avg}W</span></span>
        <span>PEAK <span className="text-[#c9d1d9]">{peak}W</span></span>
      </div>
    </div>
  );
}
