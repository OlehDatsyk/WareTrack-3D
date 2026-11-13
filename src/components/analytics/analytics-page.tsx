"use client";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import type { AnalyticsData } from "@/server/services/analytics";
import { useApiQuery } from "@/lib/query";
import { downloadText, toCsv } from "@/lib/hooks";
import { CHART, SERIES, axisTick } from "@/lib/chart-theme";
import { fmtCompact, fmtCurrency, fmtNumber } from "@/lib/format";
import { MOVEMENT_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ErrorState, PageHeader } from "@/components/common/states";

const dayFmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type TipProps = { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format?: (v: number) => string };
function Tip({ active, payload, label, format = fmtNumber as (v: number) => string }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-float">
      <div className="mb-1 font-semibold">{label ? dayFmt(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-ink-muted">{p.name}</span>
          <span className="ml-auto pl-4 font-semibold tabular">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  source,
  children,
  legend,
  className,
  tabs,
}: {
  title: string;
  source: "demo" | "recorded";
  children: React.ReactNode;
  legend?: React.ReactNode;
  className?: string;
  tabs?: React.ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <span
            className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold", source === "demo" ? "bg-sim-soft text-violet-700" : "bg-success-soft text-green-700")}
            title={source === "demo" ? "Seeded demo history plus today's simulation" : "Calculated from recorded transactions in the database"}
          >
            {source === "demo" ? "DEMO HISTORY" : "RECORDED DATA"}
          </span>
        </div>
        {tabs}
      </div>
      {legend && <div className="mb-2">{legend}</div>}
      <div className="mt-auto h-[240px] w-full shrink-0">{children}</div>
    </Card>
  );
}

const grid = <CartesianGrid vertical={false} stroke={CHART.grid} />;
const xDay = <XAxis dataKey="date" tickFormatter={dayFmt} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />;

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState("");
  const [operation, setOperation] = useState("");
  const [effView, setEffView] = useState<"rate" | "accuracy">("rate");
  const [shipView, setShipView] = useState<"ontime" | "dock">("ontime");
  const [costView, setCostView] = useState<"total" | "perOrder">("total");
  const { data, isLoading, isError, error, refetch } = useApiQuery<AnalyticsData>(["analytics"], "/api/analytics", { days, category, operation }, { placeholderData: (p) => p });
  const categories = useApiQuery<{ category: string }[]>(["inventory", "categories"], "/api/products/categories");

  const exportCsv = () => {
    if (!data) return;
    downloadText(toCsv(data.daily), `analytics-${data.range.from}-to-${data.range.to}.csv`);
  };

  const s = data?.summary;
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Analytics"
        description="Throughput, utilisation, delivery and cost performance for the selected warehouse."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data}>
            <Download /> Export CSV
          </Button>
        }
      />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList aria-label="Date range">
            {[7, 14, 30, 90, 180].map((d) => (
              <TabsTrigger key={d} value={String(d)}>
                {d}d
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-48" aria-label="Product category">
          <option value="">All categories</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.category} value={c.category}>
              {c.category}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={operation} onChange={(e) => setOperation(e.target.value)} className="w-48" aria-label="Operation type">
          <option value="">All operations</option>
          {Object.entries(MOVEMENT_TYPE).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <span className="ml-auto text-xs text-ink-muted">
          Category and operation filters apply to recorded stock-movement charts. {data && `${dayFmt(data.range.from)} – ${dayFmt(data.range.to)}`}
        </span>
      </Card>

      {isError ? (
        <Card>
          <ErrorState message={error.message} onRetry={() => refetch()} />
        </Card>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["Orders shipped", fmtNumber(s!.ordersShipped), `${s!.ordersTrend >= 0 ? "+" : ""}${s!.ordersTrend.toFixed(1)}% trend`],
              ["Units picked", fmtCompact(s!.unitsPicked), `${s!.unitsPerLaborHour.toFixed(1)} units / labour hr`],
              ["Avg utilisation", `${s!.avgUtilization.toFixed(1)}%`, "of storage positions"],
              ["Avg on-time rate", `${s!.avgOnTime.toFixed(1)}%`, `${s!.deliveredShipments} recorded deliveries`],
              ["Operating cost", fmtCurrency(s!.operatingCost), `${s!.costTrend >= 0 ? "+" : ""}${s!.costTrend.toFixed(1)}% per order`],
              ["Inventory turnover", `${s!.avgTurnover.toFixed(2)}×`, "annualised"],
            ].map(([k, v, sub]) => (
              <Card key={k} className="p-4">
                <div className="text-[12.5px] text-ink-muted">{k}</div>
                <div className="mt-1 text-xl font-semibold tabular">{v}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-subtle">{sub}</div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ChartCard title="Daily orders" source="demo" legend={<Legend items={[{ label: "Received", color: SERIES[0] }, { label: "Shipped", color: SERIES[1] }]} />}>
              <ResponsiveContainer>
                <LineChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  {xDay}
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<Tip />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
                  <Line dataKey="ordersReceived" name="Received" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
                  <Line dataKey="ordersShipped" name="Shipped" stroke={SERIES[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Warehouse utilisation" source="demo">
              <ResponsiveContainer>
                <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  {xDay}
                  <YAxis domain={[40, 100]} tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<Tip format={(v) => `${v.toFixed(1)}%`} />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
                  <Area dataKey="utilization" name="Utilisation" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Picking efficiency"
              source="demo"
              tabs={
                <Tabs value={effView} onValueChange={(v) => setEffView(v as typeof effView)}>
                  <TabsList>
                    <TabsTrigger value="rate">Units / labour hr</TabsTrigger>
                    <TabsTrigger value="accuracy">Pick accuracy</TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            >
              <ResponsiveContainer>
                <LineChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  {xDay}
                  <YAxis
                    domain={effView === "accuracy" ? [97, 100] : ["auto", "auto"]}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v) => (effView === "accuracy" ? `${v}%` : String(v))}
                  />
                  <Tooltip content={<Tip format={(v) => (effView === "accuracy" ? `${v.toFixed(2)}%` : v.toFixed(1))} />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
                  <Line
                    dataKey={effView === "rate" ? "unitsPerLaborHour" : "pickAccuracy"}
                    name={effView === "rate" ? "Units / labour hr" : "Pick accuracy"}
                    stroke={SERIES[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Shipment performance"
              source="demo"
              tabs={
                <Tabs value={shipView} onValueChange={(v) => setShipView(v as typeof shipView)}>
                  <TabsList>
                    <TabsTrigger value="ontime">On-time rate</TabsTrigger>
                    <TabsTrigger value="dock">Avg dock time</TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            >
              <ResponsiveContainer>
                <LineChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  {xDay}
                  <YAxis
                    domain={shipView === "ontime" ? [85, 100] : ["auto", "auto"]}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v) => (shipView === "ontime" ? `${v}%` : `${v}m`)}
                  />
                  <Tooltip content={<Tip format={(v) => (shipView === "ontime" ? `${v.toFixed(1)}%` : `${v.toFixed(0)} min`)} />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
                  <Line
                    dataKey={shipView === "ontime" ? "onTimeRate" : "avgDockMinutes"}
                    name={shipView === "ontime" ? "On-time" : "Dock time"}
                    stroke={SERIES[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Stock movements by week"
              source="recorded"
              legend={
                <Legend
                  items={[
                    { label: "Receipt", color: SERIES[0] },
                    { label: "Pick", color: SERIES[1] },
                    { label: "Transfer", color: SERIES[2] },
                    { label: "Adjustment", color: SERIES[3] },
                    { label: "Damage", color: SERIES[4] },
                    { label: "Other", color: CHART.muted },
                  ]}
                />
              }
            >
              <ResponsiveContainer>
                <BarChart data={data.movements} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                  {grid}
                  <XAxis dataKey="week" tickFormatter={dayFmt} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => fmtCompact(v)} />
                  <Tooltip content={<Tip />} cursor={{ fill: "#f1f5f9" }} />
                  {(["RECEIPT", "PICK", "TRANSFER", "ADJUSTMENT", "DAMAGE"] as const).map((t, i) => (
                    <Bar key={t} dataKey={t} name={MOVEMENT_TYPE[t]!.label} stackId="m" fill={SERIES[i]} stroke="#fff" strokeWidth={1} maxBarSize={36} />
                  ))}
                  <Bar dataKey="OTHER" name="Other" stackId="m" fill={CHART.muted} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Delivery performance by week"
              source="recorded"
              legend={
                <Legend
                  items={[
                    { label: "On time (≤15 min of ETA)", color: CHART.good },
                    { label: "Late", color: CHART.bad },
                  ]}
                />
              }
            >
              <ResponsiveContainer>
                <BarChart data={data.delivery} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
                  {grid}
                  <XAxis dataKey="week" tickFormatter={dayFmt} tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<Tip />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="onTime" name="On time" stackId="d" fill={CHART.good} stroke="#fff" strokeWidth={1} maxBarSize={36} />
                  <Bar dataKey="late" name="Late" stackId="d" fill={CHART.bad} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Operational costs"
              source="demo"
              tabs={
                <Tabs value={costView} onValueChange={(v) => setCostView(v as typeof costView)}>
                  <TabsList>
                    <TabsTrigger value="total">Daily total</TabsTrigger>
                    <TabsTrigger value="perOrder">Per order</TabsTrigger>
                  </TabsList>
                </Tabs>
              }
            >
              <ResponsiveContainer>
                <BarChart data={data.daily} margin={{ top: 4, right: 8, left: -4, bottom: 0 }} barCategoryGap="20%">
                  {grid}
                  {xDay}
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => (costView === "total" ? `$${fmtCompact(v)}` : `$${v}`)} />
                  <Tooltip content={<Tip format={(v) => fmtCurrency(v, costView === "perOrder")} />} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey={costView === "total" ? "operatingCost" : "costPerOrder"} name={costView === "total" ? "Operating cost" : "Cost per order"} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Inventory turnover" source="demo">
              <ResponsiveContainer>
                <LineChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  {grid}
                  {xDay}
                  <YAxis domain={[6, 11]} tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${v}×`} />
                  <Tooltip content={<Tip format={(v) => `${v.toFixed(2)}×`} />} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} />
                  <Line dataKey="inventoryTurnover" name="Turnover" stroke={SERIES[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={`Units by category — ${operation ? MOVEMENT_TYPE[operation]?.label : "Picks"}`} source="recorded" className="lg:col-span-2">
              {data.byCategory.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-ink-muted">No recorded movements for these filters.</div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={data.byCategory} layout="vertical" margin={{ top: 0, right: 24, left: 24, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid horizontal={false} stroke={CHART.grid} />
                    <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v)} />
                    <YAxis type="category" dataKey="category" tick={axisTick} axisLine={false} tickLine={false} width={120} />
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-float">
                            <div className="font-semibold">{(payload[0]!.payload as { category: string }).category}</div>
                            <div className="tabular">{fmtNumber(payload[0]!.value as number)} units</div>
                          </div>
                        ) : null
                      }
                      cursor={{ fill: "#f1f5f9" }}
                    />
                    <Bar dataKey="units" name="Units" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
