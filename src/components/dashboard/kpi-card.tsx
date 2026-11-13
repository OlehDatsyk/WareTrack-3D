"use client";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import type { Kpi } from "@/server/services/dashboard";
import { fmtCompact, fmtNumber, pctChange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/primitives";

function formatValue(v: number, f: Kpi["format"]) {
  if (f === "percent") return `${v.toFixed(1)}%`;
  if (f === "compact") return v >= 10_000 ? fmtCompact(v) : fmtNumber(Math.round(v));
  return fmtNumber(Math.round(v));
}

/** 14-point sparkline: history in a de-emphasised hue, the current point in the accent. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-8 w-24 overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" stroke="#bfd4fe" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path
        d={`M${pts[pts.length - 2]![0]},${pts[pts.length - 2]![1]} L${last[0]},${last[1]}`}
        stroke="#2563eb"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill="#2563eb" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const change = kpi.previous != null ? pctChange(kpi.value, kpi.previous) : null;
  const flat = change == null || Math.abs(change) < 0.05;
  const good = flat || kpi.upIsGood == null ? null : (change! > 0) === kpi.upIsGood;
  const Icon = flat ? Minus : change! > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex flex-col justify-between rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink-muted">
          {kpi.label}
          <Tooltip content={kpi.hint}>
            <button type="button" className="text-ink-subtle hover:text-ink-muted" aria-label={`About ${kpi.label}`}>
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        </div>
        {kpi.source === "history" && (
          <span className="rounded bg-sim-soft px-1.5 py-0.5 text-[10px] font-semibold text-violet-700" title="Seeded demo history">
            DEMO
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular">{formatValue(kpi.value, kpi.format)}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {change != null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold tabular",
                  good == null ? "bg-slate-100 text-slate-600" : good ? "bg-success-soft text-green-700" : "bg-danger-soft text-red-700",
                )}
              >
                <Icon className="size-3" />
                {flat ? "0.0" : `${change! > 0 ? "+" : ""}${change!.toFixed(1)}`}%
              </span>
            ) : (
              <span className="text-ink-subtle">—</span>
            )}
            <span className="truncate text-ink-muted">
              {kpi.comparison}
              {kpi.previous != null && <span className="text-ink-subtle"> ({formatValue(kpi.previous, kpi.format)})</span>}
            </span>
          </div>
        </div>
        <Sparkline values={kpi.spark} />
      </div>
    </div>
  );
}
