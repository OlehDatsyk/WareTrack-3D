"use client";
import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  CheckCircle2,
  EyeOff,
  Grid2x2,
  Home,
  MapPinned,
  Minus,
  MousePointerClick,
  Plus,
  Tag,
  Warehouse,
} from "lucide-react";
import type { SceneData } from "@/server/services/scene";
import type { DashboardData } from "@/server/services/dashboard";
import { fmtCompact, fmtTime } from "@/lib/format";
import { SHIPMENT_STATUS, VEHICLE_STATUS, shipmentStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useSceneStore } from "@/stores/scene-store";
import { Badge, SimBadge } from "@/components/ui/badge";
import { ProgressBar, Tooltip } from "@/components/ui/primitives";
import { selectionBounds } from "@/components/three/selection";

const glass = "rounded-2xl border border-line/80 bg-surface/95 shadow-float backdrop-blur";

// ───────────────────────────── toolbar ─────────────────────────────

function ToolButton({ label, onClick, active, children, shortcut }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode; shortcut?: string }) {
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label} side="right">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-slate-100 hover:text-ink [&_svg]:size-4",
          active && "bg-brand-50 text-brand-600 hover:bg-brand-100 hover:text-brand-700",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function SceneToolbar() {
  const camera = useSceneStore((s) => s.camera);
  const view = useSceneStore((s) => s.view);
  const showRoof = useSceneStore((s) => s.showRoof);
  const showLabels = useSceneStore((s) => s.showLabels);
  const showZones = useSceneStore((s) => s.showZones);
  const toggleRoof = useSceneStore((s) => s.toggleRoof);
  const toggleLabels = useSceneStore((s) => s.toggleLabels);
  const toggleZones = useSceneStore((s) => s.toggleZones);
  return (
    <div className={cn(glass, "flex flex-col gap-0.5 p-1")} role="toolbar" aria-label="3D view controls" aria-orientation="vertical">
      <ToolButton label="Zoom in" onClick={() => camera("zoomIn")}>
        <Plus />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={() => camera("zoomOut")}>
        <Minus />
      </ToolButton>
      <div className="mx-2 my-0.5 h-px bg-line" />
      <ToolButton label="Reset camera" shortcut="R" onClick={() => camera("reset")}>
        <Home />
      </ToolButton>
      <ToolButton label={view === "top" ? "Isometric view" : "Top-down view"} shortcut="T" active={view === "top"} onClick={() => camera(view === "top" ? "iso" : "top")}>
        <MapPinned />
      </ToolButton>
      <div className="mx-2 my-0.5 h-px bg-line" />
      <ToolButton label={showRoof ? "Show interior (cut-away)" : "Show exterior (roof on)"} active={showRoof} onClick={toggleRoof}>
        <Warehouse />
      </ToolButton>
      <ToolButton label={showZones ? "Hide zone overlay" : "Show zone overlay"} active={showZones} onClick={toggleZones}>
        <Grid2x2 />
      </ToolButton>
      <ToolButton label={showLabels ? "Hide labels" : "Show labels"} active={showLabels} onClick={toggleLabels}>
        {showLabels ? <Tag /> : <EyeOff />}
      </ToolButton>
    </div>
  );
}

// ───────────────────────────── KPI chips ─────────────────────────────

export function KpiChips({ dashboard, scene }: { dashboard?: DashboardData; scene: SceneData }) {
  const kpi = (k: string) => dashboard?.kpis.find((x) => x.key === k);
  const stock = kpi("stock");
  const trucks = kpi("trucks");
  const ontime = kpi("ontime");
  const movingLifts = scene.vehicles.filter((v) => v.task).length;
  const lifts = scene.vehicles.filter((v) => (v.type === "FORKLIFT" || v.type === "REACH_TRUCK") && v.onSite).length;
  const chips = [
    { label: "Stock on hand", value: stock ? fmtCompact(stock.value) : "—", sub: `${scene.pallets.length} pallets`, icon: Box },
    { label: "Trucks on site", value: trucks ? String(Math.round(trucks.value)) : "—", sub: `${scene.docks.filter((d) => d.shipment).length}/${scene.docks.length} docks busy`, icon: ArrowDownToLine },
    { label: "Forklifts active", value: `${movingLifts}/${lifts}`, sub: "executing tasks", icon: ArrowUpFromLine },
    { label: "On-time delivery", value: ontime ? `${ontime.value.toFixed(1)}%` : "—", sub: "last 30 days", icon: CheckCircle2 },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <div key={c.label} className={cn(glass, "flex min-w-[148px] items-center gap-2.5 px-3 py-2")}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <c.icon className="size-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[11px] text-ink-muted">{c.label}</div>
            <div className="text-[15px] font-semibold tabular">{c.value}</div>
            <div className="text-[10.5px] text-ink-subtle">{c.sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── Shipment tracker ─────────────────────────────

const STEPS = ["AT_DOCK", "LOADING", "IN_TRANSIT", "DELIVERED"] as const;
const STEP_LABEL = { AT_DOCK: "At dock", LOADING: "Loading", IN_TRANSIT: "In transit", DELIVERED: "Delivered" };

export function ShipmentTracker({ shipments }: { shipments: DashboardData["shipments"] }) {
  const outbound = shipments.filter((s) => s.direction === "OUTBOUND");
  const [index, setIndex] = useState(0);
  const s = outbound[Math.min(index, outbound.length - 1)];
  if (!s) return null;
  const stepIndex = s.status === "READY" ? 1.9 : s.status === "DELAYED" ? 2 : STEPS.indexOf(s.status as (typeof STEPS)[number]);
  return (
    <div className={cn(glass, "w-[520px] max-w-[calc(100vw-2rem)] px-4 py-3")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
          Shipment tracking
          {s.simulated && <SimBadge />}
        </div>
        {outbound.length > 1 && (
          <div className="flex items-center gap-1">
            {outbound.slice(0, 6).map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${x.trackingNumber}`}
                className={cn("size-1.5 rounded-full", i === index ? "bg-brand-600" : "bg-slate-300 hover:bg-slate-400")}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="relative flex items-center justify-between">
            <div className="absolute top-[9px] right-3 left-3 h-0.5 bg-slate-200" />
            <div
              className={cn("absolute top-[9px] left-3 h-0.5", s.status === "DELAYED" ? "bg-danger" : "bg-brand-600")}
              style={{ width: `calc(${(Math.max(0, stepIndex) / (STEPS.length - 1)) * 100}% - 24px)` }}
            />
            {STEPS.map((step, i) => {
              const done = i < stepIndex || (i === stepIndex && step === "DELIVERED");
              const current = Math.floor(stepIndex) === i;
              return (
                <div key={step} className="relative z-10 flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border-2 bg-surface",
                      done ? "border-brand-600 bg-brand-600" : current ? (s.status === "DELAYED" ? "border-danger" : "border-brand-600") : "border-slate-300",
                    )}
                  >
                    {done && <CheckCircle2 className="size-3 text-white" />}
                    {current && !done && <span className={cn("size-1.5 rounded-full", s.status === "DELAYED" ? "bg-danger" : "bg-brand-600")} />}
                  </span>
                  <span className={cn("text-[10.5px]", current ? "font-semibold text-ink" : "text-ink-muted")}>{STEP_LABEL[step]}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="w-44 shrink-0 rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">{s.trackingNumber}</span>
            <Badge tone={SHIPMENT_STATUS[s.status]?.tone} className="px-1.5 text-[10px]">
              {shipmentStatusLabel(s.status, s.direction)}
            </Badge>
          </div>
          <div className="truncate text-[11px] text-ink-muted">To: {s.destination}</div>
          <div className="mt-1 text-[11px] text-ink-muted">
            {s.vehicle ?? s.carrier}
            {s.dock ? ` · ${s.dock}` : ""} · ETA {fmtTime(s.eta)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Operations panel ─────────────────────────────

export function OperationsPanel({ scene }: { scene: SceneData }) {
  const [tab, setTab] = useState<"docks" | "lifts" | "trucks">("docks");
  const select = useSceneStore((s) => s.select);
  const camera = useSceneStore((s) => s.camera);
  const go = (kind: "dock" | "vehicle", id: string) => {
    const sel = { kind, id } as const;
    select(sel);
    const b = selectionBounds(scene, sel);
    if (b) camera("focus", b.center);
  };
  const lifts = useMemo(() => scene.vehicles.filter((v) => v.type === "FORKLIFT" || v.type === "REACH_TRUCK"), [scene.vehicles]);
  const trucks = useMemo(() => scene.vehicles.filter((v) => v.type === "TRUCK" || v.type === "VAN"), [scene.vehicles]);
  const tabs = [
    { key: "docks", label: "Docks", count: `${scene.docks.filter((d) => d.shipment).length}/${scene.docks.length}` },
    { key: "lifts", label: "Forklifts", count: `${lifts.filter((l) => l.status === "IN_USE").length}/${lifts.length}` },
    { key: "trucks", label: "Trucks", count: String(trucks.filter((t) => t.onSite).length) },
  ] as const;
  return (
    <div className={cn(glass, "w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden")}>
      <div className="flex border-b border-line px-2 pt-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 text-[12.5px] font-medium",
              tab === t.key ? "border-brand-600 text-ink" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
            <span className="rounded bg-slate-100 px-1 text-[10.5px] text-ink-muted tabular">{t.count}</span>
          </button>
        ))}
      </div>
      <ul className="scrollbar-thin max-h-[190px] divide-y divide-line overflow-y-auto" role="tabpanel">
        {tab === "docks" &&
          scene.docks.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => go("dock", d.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted">
                <span className="w-12 text-[12px] font-semibold">{d.name}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">
                  {d.shipment ? `${d.shipment.trackingNumber} · ${d.shipment.vehicleCode ?? d.shipment.carrier}` : d.status === "MAINTENANCE" ? "Under maintenance" : "No truck assigned"}
                </span>
                <Badge tone={d.shipment ? (d.shipment.status === "LOADING" ? "brand" : "info") : d.status === "MAINTENANCE" ? "danger" : "success"} className="text-[10.5px]">
                  {d.shipment ? shipmentStatusLabel(d.shipment.status, d.shipment.direction) : d.status === "MAINTENANCE" ? "Maint." : "Available"}
                </Badge>
              </button>
            </li>
          ))}
        {tab === "lifts" &&
          lifts.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => go("vehicle", v.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted">
                <span className="w-12 text-[12px] font-semibold">{v.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-ink-muted">{v.task ? v.task.description : (v.operator ?? "No operator")}</span>
                  <ProgressBar value={v.energyLevel} tone="energy" className="mt-1 h-1" label={`${v.code} battery`} />
                </span>
                <Badge tone={VEHICLE_STATUS[v.status]?.tone} className="text-[10.5px]">
                  {VEHICLE_STATUS[v.status]?.label}
                </Badge>
              </button>
            </li>
          ))}
        {tab === "trucks" &&
          trucks.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => (v.onSite ? go("vehicle", v.id) : select({ kind: "vehicle", id: v.id }))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-muted"
              >
                <span className="w-16 text-[12px] font-semibold">{v.code}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">{v.locationLabel}</span>
                <Badge tone={v.onSite ? VEHICLE_STATUS[v.status]?.tone : "info"} className="text-[10.5px]">
                  {v.onSite ? VEHICLE_STATUS[v.status]?.label : "En route"}
                </Badge>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function SceneHint() {
  return (
    <div className={cn(glass, "flex items-center gap-3 px-4 py-3 text-[12.5px] text-ink-muted")}>
      <MousePointerClick className="size-4 shrink-0 text-brand-600" />
      <span>
        Click any <strong className="text-ink">rack, pallet, forklift, truck, dock or zone</strong> to inspect and manage it. Drag to rotate, right-drag to pan, scroll to
        zoom.
      </span>
    </div>
  );
}
