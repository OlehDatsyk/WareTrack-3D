"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, SERIES, axisTick } from "@/lib/chart-theme";
import { fmtNumber } from "@/lib/format";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";

type Point = { date: string; ordersReceived: number; ordersShipped: number; onTimeRate: number; partial: boolean };

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-float">
      <div className="mb-1 font-semibold text-ink">{label ? dayLabel(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-semibold text-ink tabular">
            {unit === "%" ? `${p.value.toFixed(1)}%` : fmtNumber(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PerformanceChart({ data }: { data: Point[] }) {
  const [view, setView] = useState<"orders" | "ontime">("orders");
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "orders" | "ontime")}>
          <TabsList>
            <TabsTrigger value="orders">Order flow</TabsTrigger>
            <TabsTrigger value="ontime">On-time rate</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === "orders" ? (
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SERIES[0] }} /> Received
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SERIES[1] }} /> Shipped
            </span>
            <span className="text-ink-subtle">Last 14 days · today partial</span>
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">Daily on-time delivery, last 14 days</span>
        )}
      </div>
      <div className="h-[240px]" role="img" aria-label={view === "orders" ? "Orders received and shipped per day" : "On-time delivery rate per day"}>
        <ResponsiveContainer width="100%" height="100%">
          {view === "orders" ? (
            <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="ordersReceived" name="Received" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="ordersShipped" name="Shipped" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis domain={[85, 100]} tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip unit="%" />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
              <Line dataKey="onTimeRate" name="On-time" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
