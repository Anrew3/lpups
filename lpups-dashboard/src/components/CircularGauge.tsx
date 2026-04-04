import React from "react";

interface Props {
  pct:       number;   // 0-100
  color:     string;
  size?:     number;   // px, default 140
  label?:    string;   // center large text, default pct%
  sublabel?: string;   // center small text
  charging?: boolean;
  thickness?: number;
}

export default function CircularGauge({
  pct, color, size = 140, label, sublabel, charging = false, thickness = 8,
}: Props): React.ReactElement {
  const r       = (size - thickness) / 2;
  const cx      = size / 2;
  const cy      = size / 2;
  const full    = 2 * Math.PI * r;
  // Use 270° of arc (gap at bottom)
  const arcLen  = full * 0.75;
  const offset  = arcLen - (Math.min(100, Math.max(0, pct)) / 100) * arcLen;
  // Rotate so arc starts at 135° (bottom-left) and ends at 45° (bottom-right)
  const rotation = 135;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#21262d"
          strokeWidth={thickness}
          strokeDasharray={`${arcLen} ${full - arcLen}`}
          strokeLinecap="round"
        />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={`${arcLen} ${full - arcLen}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="gauge-arc"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0">
        {charging && (
          <span className="text-[11px] bolt-pulse" style={{ color }}>⚡</span>
        )}
        <span className="text-xl font-bold leading-none" style={{ color }}>
          {label ?? `${pct}%`}
        </span>
        {sublabel && (
          <span className="text-[10px] text-[#8b949e] leading-none mt-0.5">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
