"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";

export type MapRoute = {
  id: string;
  trackingNumber: string;
  direction: string;
  status: string;
  label: string;
  city: string;
  x: number;
  y: number;
  progress: number;
  eta: string;
};

const W = 600;
const H = 340;

/**
 * Schematic route view. Positions are the simulation's route progress along a straight
 * line between the warehouse and the destination — not GPS.
 */
export function RouteMap({
  origin,
  routes,
  selectedId,
  onSelect,
  className,
}: {
  origin: { name: string; x: number; y: number };
  routes: MapRoute[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // fit the view to the points in play (with a minimum span so short routes stay readable)
  const xs = [origin.x, ...routes.map((r) => r.x)];
  const ys = [origin.y, ...routes.map((r) => r.y)];
  const span = Math.max(0.28, Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * (W / H));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const scale = (W - 120) / span;
  const px = (x: number) => W / 2 + (x - cx) * scale;
  const py = (y: number) => H / 2 + (y - cy) * scale;
  const ox = px(origin.x);
  const oy = py(origin.y);
  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Schematic map of vehicles en route">
        <defs>
          <pattern id="map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} rx="12" fill="#f8fafc" />
        <rect width={W} height={H} rx="12" fill="url(#map-grid)" />
        {routes.map((r) => {
          const dx = px(r.x);
          const dy = py(r.y);
          const inbound = r.direction === "INBOUND";
          const sx = inbound ? dx : ox;
          const sy = inbound ? dy : oy;
          const ex = inbound ? ox : dx;
          const ey = inbound ? oy : dy;
          const t = Math.min(1, Math.max(0, r.progress));
          const vx = sx + (ex - sx) * t;
          const vy = sy + (ey - sy) * t;
          const active = selectedId === r.id || hover === r.id;
          const delayed = r.status === "DELAYED";
          const color = delayed ? "#dc2626" : inbound ? "#0ea5e9" : "#2563eb";
          return (
            <g key={r.id} className="cursor-pointer" onClick={() => onSelect?.(r.id)} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={color} strokeOpacity={active ? 0.55 : 0.22} strokeWidth={active ? 3 : 2} strokeDasharray="5 5" />
              <line x1={sx} y1={sy} x2={vx} y2={vy} stroke={color} strokeWidth={active ? 3 : 2} strokeLinecap="round" />
              <circle cx={dx} cy={dy} r={4} fill="#fff" stroke="#64748b" strokeWidth={1.5} />
              <circle cx={vx} cy={vy} r={active ? 8 : 6.5} fill={color} stroke="#fff" strokeWidth={2.5} />
              {/* hit target larger than the mark */}
              <circle cx={vx} cy={vy} r={14} fill="transparent" />
              {active && (
                <g transform={`translate(${Math.min(vx + 12, W - 170)}, ${Math.max(vy - 34, 6)})`} pointerEvents="none">
                  <rect width="160" height="44" rx="8" fill="#172033" opacity="0.94" />
                  <text x="10" y="18" fill="#fff" fontSize="12" fontWeight="600">
                    {r.label} · {r.trackingNumber}
                  </text>
                  <text x="10" y="34" fill="#cbd5e1" fontSize="11">
                    {inbound ? "From" : "To"} {r.city.split(",")[0]} · ETA {fmtTime(r.eta)}
                  </text>
                </g>
              )}
              <text x={dx + 7} y={dy + 4} fontSize="10.5" fill="#64748b">
                {r.city.split(",")[0]}
              </text>
            </g>
          );
        })}
        <g>
          <circle cx={ox} cy={oy} r={11} fill="#2563eb" opacity="0.15" />
          <rect x={ox - 6} y={oy - 6} width="12" height="12" rx="3" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          <text x={ox + 12} y={oy - 8} fontSize="11.5" fontWeight="600" fill="#172033">
            {origin.name}
          </text>
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-2 left-3 rounded-md bg-white/90 px-2 py-1 text-[10.5px] text-ink-muted shadow-sm">
        Schematic view · positions are simulated route progress, not live GPS
      </div>
    </div>
  );
}
