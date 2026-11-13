"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertOctagon,
  ArrowRightLeft,
  BatteryCharging,
  Boxes,
  ClipboardCheck,
  Crosshair,
  DoorOpen,
  ExternalLink,
  Forklift,
  LayoutGrid,
  Package,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import type { SceneData } from "@/server/services/scene";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { fmtDate, fmtDateTime, fmtNumber, fmtRelative, humanize } from "@/lib/format";
import { PALLET_STATUS, SHIPMENT_STATUS, TASK_TYPE, VEHICLE_STATUS, VEHICLE_TYPE, ZONE_STATUS, ZONE_TYPE, shipmentStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useSceneStore, type Selection } from "@/stores/scene-store";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { ProgressBar, Skeleton, Tooltip } from "@/components/ui/primitives";
import { DetailRow, ErrorState, SectionTitle, StatusBadge } from "@/components/common/states";
import { selectionBounds } from "@/components/three/selection";
import { AssignShipmentDialog, AssignTaskDialog, DamageDialog, MovePalletDialog, ZoneStatusDialog } from "./action-dialogs";

const KIND_META = {
  pallet: { label: "Pallet", icon: Package },
  rack: { label: "Storage rack", icon: Boxes },
  vehicle: { label: "Vehicle", icon: Forklift },
  dock: { label: "Loading dock", icon: DoorOpen },
  zone: { label: "Warehouse zone", icon: LayoutGrid },
} as const;

const LIVE = [["scene"], ["dashboard"], ["inspect"], ["fleet"], ["tasks"]] as const;

function Shell({
  selection,
  title,
  subtitle,
  badge,
  children,
  actions,
  scene,
}: {
  selection: NonNullable<Selection>;
  title: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  scene: SceneData;
}) {
  const select = useSceneStore((s) => s.select);
  const camera = useSceneStore((s) => s.camera);
  const meta = KIND_META[selection.kind];
  const Icon = meta.icon;
  const focus = () => {
    const b = selectionBounds(scene, selection);
    if (b) camera("focus", b.center);
  };
  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface/97 shadow-pop backdrop-blur">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{meta.label}</div>
          <div className="truncate text-[15px] font-semibold text-ink">{title}</div>
          {subtitle && <div className="truncate text-xs text-ink-muted">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip content="Focus camera">
            <button type="button" onClick={focus} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Focus camera">
              <Crosshair className="size-4" />
            </button>
          </Tooltip>
          <button type="button" onClick={() => select(null)} className="rounded-md p-1.5 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Close inspector">
            <X className="size-4" />
          </button>
        </div>
      </div>
      {badge && <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">{badge}</div>}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {actions && <div className="flex flex-wrap gap-2 border-t border-line bg-surface-muted/60 px-4 py-3">{actions}</div>}
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-pop">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

// ───────────────────────────── Pallet ─────────────────────────────

type PalletDetail = {
  id: string;
  code: string;
  quantity: number;
  lot: string | null;
  status: string;
  grossWeightKg: number;
  receivedAt: string;
  product: { id: string; sku: string; name: string; category: string; unit: string; barcode: string | null; supplier: { name: string } | null };
  location: { code: string; type: string; level: number; zone: { id: string; name: string; status: string }; rack: { id: string; code: string } | null } | null;
  tasks: { id: string; number: string; type: string; status: string; progress: number; vehicle: { code: string } | null; toLocation: { code: string } | null }[];
  movements: { id: string; type: string; quantity: number; createdAt: string; simulated: boolean; fromZone: { name: string } | null; toZone: { name: string } | null }[];
};

function PalletInspector({ id, scene }: { id: string; scene: SceneData }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<PalletDetail>(["inspect", "pallet", id], `/api/pallets/${id}`);
  const canAdjust = useCan("inventory:adjust");
  const [moveOpen, setMove] = useState(false);
  const [damageOpen, setDamage] = useState(false);
  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  const openTask = data.tasks[0];
  return (
    <>
      <Shell
        selection={{ kind: "pallet", id }}
        scene={scene}
        title={data.product.name}
        subtitle={`${data.code} · ${data.product.sku}`}
        badge={
          <>
            <StatusBadge map={PALLET_STATUS} value={data.status} />
            <Badge tone="neutral">{data.product.category}</Badge>
          </>
        }
        actions={
          canAdjust ? (
            <>
              <Button size="sm" onClick={() => setMove(true)} disabled={!!openTask || data.status === "DAMAGED"}>
                <ArrowRightLeft /> Move pallet
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/inventory?product=${data.product.id}`}>
                  <Package /> Inventory
                </Link>
              </Button>
              <Button size="sm" variant="destructive-outline" onClick={() => setDamage(true)} disabled={data.status === "DAMAGED" || !!openTask}>
                <AlertOctagon /> Damage
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/inventory?product=${data.product.id}`}>
                <Package /> Inspect inventory
              </Link>
            </Button>
          )
        }
      >
        {openTask && (
          <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 p-3 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-brand-700">
                {openTask.number} · {TASK_TYPE[openTask.type]}
              </span>
              <span className="text-xs text-brand-700">{humanize(openTask.status)}</span>
            </div>
            <div className="mt-1 text-xs text-brand-700/80">
              {openTask.vehicle ? `${openTask.vehicle.code} → ` : "Queued → "}
              {openTask.toLocation?.code ?? "dock"}
            </div>
            <ProgressBar value={openTask.progress} className="mt-2 bg-white" />
          </div>
        )}
        <DetailRow label="Quantity">
          {fmtNumber(data.quantity)} {data.product.unit}
        </DetailRow>
        <DetailRow label="Gross weight">{data.grossWeightKg} kg</DetailRow>
        <DetailRow label="Location">{data.location ? `${data.location.zone.name} · ${data.location.code}` : "In transit"}</DetailRow>
        {data.location?.rack && <DetailRow label="Rack / level">{`${data.location.rack.code} · L${data.location.level + 1}`}</DetailRow>}
        <DetailRow label="Lot">{data.lot ?? "—"}</DetailRow>
        <DetailRow label="Received">{fmtDate(data.receivedAt)}</DetailRow>
        <DetailRow label="Supplier">{data.product.supplier?.name ?? "—"}</DetailRow>
        <DetailRow label="Barcode">
          <span className="font-mono text-xs">{data.product.barcode ?? "—"}</span>
        </DetailRow>
        {data.movements.length > 0 && (
          <>
            <SectionTitle>Recent movements</SectionTitle>
            <ul className="space-y-1.5">
              {data.movements.slice(0, 4).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-ink">
                    {humanize(m.type)} {m.fromZone ? `${m.fromZone.name} → ` : ""}
                    {m.toZone?.name ?? ""}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-ink-subtle">
                    {m.simulated && <SimBadge />}
                    {fmtRelative(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Shell>
      {moveOpen && <MovePalletDialog open={moveOpen} onOpenChange={setMove} pallet={data} />}
      {damageOpen && <DamageDialog open={damageOpen} onOpenChange={setDamage} pallet={data} />}
    </>
  );
}

// ───────────────────────────── Rack ─────────────────────────────

type RackDetail = {
  id: string;
  code: string;
  kind: string;
  levels: number;
  columns: number;
  capacity: number;
  occupied: number;
  available: number;
  blocked: number;
  utilization: number;
  zone: { name: string; temperatureC: number | null; status: string };
  products: { id: string; sku: string; name: string; pallets: number; units: number }[];
  locations: { id: string; code: string; level: number; column: number; isBlocked: boolean; pallet: { id: string; code: string; product: { name: string } } | null }[];
};

function RackInspector({ id, scene }: { id: string; scene: SceneData }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<RackDetail>(["inspect", "rack", id], `/api/racks/${id}`);
  const select = useSceneStore((s) => s.select);
  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  const grid: RackDetail["locations"][] = [];
  for (let l = data.levels - 1; l >= 0; l--) grid.push(data.locations.filter((x) => x.level === l).sort((a, b) => a.column - b.column));
  return (
    <Shell
      selection={{ kind: "rack", id }}
      scene={scene}
      title={`Rack ${data.code}`}
      subtitle={`${data.zone.name} · ${data.kind === "SHELVING" ? "Carton shelving" : "Selective pallet racking"}`}
      badge={<Badge tone={data.utilization >= 90 ? "danger" : data.utilization >= 75 ? "warning" : "success"}>{data.utilization.toFixed(0)}% utilised</Badge>}
    >
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Capacity", data.capacity],
          ["Occupied", data.occupied],
          ["Available", data.available],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-muted px-2.5 py-2">
            <div className="text-[11px] text-ink-muted">{k}</div>
            <div className="text-base font-semibold tabular">{v}</div>
          </div>
        ))}
      </div>
      <ProgressBar value={data.utilization} tone="auto" className="mt-3" label="Rack utilisation" />
      <SectionTitle>Slot map</SectionTitle>
      <div className="space-y-1" role="grid" aria-label="Rack slot map">
        {grid.map((row, i) => (
          <div key={i} className="flex items-center gap-1" role="row">
            <span className="w-5 shrink-0 text-[10px] text-ink-subtle">L{data.levels - i}</span>
            {row.map((loc) => (
              <Tooltip key={loc.id} content={loc.pallet ? `${loc.code} · ${loc.pallet.code} · ${loc.pallet.product.name}` : `${loc.code} · ${loc.isBlocked ? "blocked" : "empty"}`}>
                <button
                  type="button"
                  role="gridcell"
                  onClick={() => loc.pallet && select({ kind: "pallet", id: loc.pallet.id })}
                  className={cn(
                    "h-4 flex-1 rounded-[3px]",
                    loc.pallet ? "bg-brand-500 hover:bg-brand-700" : loc.isBlocked ? "bg-red-200" : "bg-slate-200",
                  )}
                  aria-label={loc.pallet ? `${loc.code} occupied by ${loc.pallet.code}` : `${loc.code} empty`}
                />
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
      <SectionTitle>Stored products</SectionTitle>
      {data.products.length === 0 ? (
        <p className="text-xs text-ink-muted">This rack is empty.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.products.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <Link href={`/inventory?product=${p.id}`} className="truncate font-medium text-ink hover:text-brand-600">
                {p.name}
              </Link>
              <span className="shrink-0 text-ink-muted tabular">
                {p.pallets} plt · {fmtNumber(p.units)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

// ───────────────────────────── Vehicle ─────────────────────────────

type VehicleDetail = {
  id: string;
  code: string;
  type: string;
  model: string;
  status: string;
  energyType: string;
  energyLevel: number;
  registration: string | null;
  carrier: string | null;
  locationLabel: string;
  onSite: boolean;
  hoursUsed: number;
  nextServiceDue: string | null;
  operator: { firstName: string; lastName: string } | null;
  tasks: { id: string; number: string; type: string; status: string; description: string; progress: number; simulated: boolean }[];
  shipments: { id: string; trackingNumber: string; status: string; destination: string; eta: string; direction: string }[];
};

function VehicleInspector({ id, scene }: { id: string; scene: SceneData }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<VehicleDetail>(["inspect", "vehicle", id], `/api/vehicles/${id}`);
  const canAssign = useCan("fleet:assign");
  const canWrite = useCan("fleet:write");
  const [assignOpen, setAssign] = useState(false);
  const charge = useApiMutation<void>({ path: `/api/vehicles/${id}/charge`, invalidate: LIVE, success: "Sent to the charging bay" });
  const setStatus = useApiMutation<{ status: string }>({ path: `/api/vehicles/${id}`, method: "PATCH", invalidate: LIVE, success: (_, i) => `Status set to ${humanize(i.status)}` });
  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  const lift = ["FORKLIFT", "REACH_TRUCK", "PALLET_JACK"].includes(data.type);
  const current = data.tasks.find((t) => t.status === "IN_PROGRESS");
  const activeShipment = data.shipments.find((s) => ["AT_DOCK", "LOADING", "READY", "IN_TRANSIT", "DELAYED"].includes(s.status));
  return (
    <>
      <Shell
        selection={{ kind: "vehicle", id }}
        scene={scene}
        title={data.code}
        subtitle={`${VEHICLE_TYPE[data.type]} · ${data.model}`}
        badge={<StatusBadge map={VEHICLE_STATUS} value={data.status} />}
        actions={
          <>
            {lift && canAssign && (
              <Button size="sm" onClick={() => setAssign(true)} disabled={data.status !== "AVAILABLE"}>
                <ClipboardCheck /> Assign task
              </Button>
            )}
            {lift && canAssign && data.energyType === "ELECTRIC" && (
              <Button size="sm" variant="outline" onClick={() => charge.mutate()} disabled={data.status !== "AVAILABLE"} loading={charge.isPending}>
                <BatteryCharging /> Charge
              </Button>
            )}
            {canWrite && data.status !== "IN_USE" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStatus.mutate({ status: data.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE" })}
                loading={setStatus.isPending}
              >
                <Wrench /> {data.status === "MAINTENANCE" ? "Return to service" : "Maintenance"}
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/fleet?id=${data.id}`}>
                <ExternalLink /> Fleet
              </Link>
            </Button>
          </>
        }
      >
        <div className="mb-3 rounded-lg bg-surface-muted p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-ink-muted">{data.energyType === "ELECTRIC" ? "Battery" : "Fuel"}</span>
            <span className="font-semibold tabular">{data.energyLevel}%</span>
          </div>
          <ProgressBar value={data.energyLevel} tone="energy" label="Energy level" />
        </div>
        <DetailRow label="Operator">{data.operator ? `${data.operator.firstName} ${data.operator.lastName}` : "Unassigned"}</DetailRow>
        <DetailRow label="Location">{data.locationLabel}</DetailRow>
        {data.registration && <DetailRow label="Registration">{data.registration}</DetailRow>}
        <DetailRow label="Hours / km">{fmtNumber(data.hoursUsed)}</DetailRow>
        <DetailRow label="Next service">{fmtDate(data.nextServiceDue)}</DetailRow>
        {current && (
          <>
            <SectionTitle>Current task</SectionTitle>
            <div className="rounded-lg border border-line p-3 text-[13px]">
              <div className="flex items-center gap-1.5 font-semibold">
                {current.number} · {TASK_TYPE[current.type]} {current.simulated && <SimBadge />}
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">{current.description}</div>
              <ProgressBar value={current.progress} className="mt-2" />
            </div>
          </>
        )}
        {activeShipment && (
          <>
            <SectionTitle>Shipment</SectionTitle>
            <Link href={`/shipments?id=${activeShipment.id}`} className="block rounded-lg border border-line p-3 text-[13px] hover:bg-surface-muted">
              <div className="flex items-center justify-between font-semibold">
                {activeShipment.trackingNumber}
                <Badge tone={SHIPMENT_STATUS[activeShipment.status]?.tone}>{shipmentStatusLabel(activeShipment.status, activeShipment.direction)}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-ink-muted">
                To {activeShipment.destination} · ETA {fmtDateTime(activeShipment.eta)}
              </div>
            </Link>
          </>
        )}
      </Shell>
      {assignOpen && <AssignTaskDialog open={assignOpen} onOpenChange={setAssign} vehicle={data} />}
    </>
  );
}

// ───────────────────────────── Dock ─────────────────────────────

type DockDetail = {
  id: string;
  code: string;
  name: string;
  direction: string;
  status: string;
  current: {
    id: string;
    trackingNumber: string;
    status: string;
    direction: string;
    carrier: string;
    destination: string;
    origin: string;
    loadingProgress: number;
    palletCount: number;
    eta: string;
    simulated: boolean;
    vehicle: { id: string; code: string } | null;
    driver: { firstName: string; lastName: string } | null;
    _count: { orders: number };
  } | null;
  upcoming: { id: string; trackingNumber: string; status: string; direction: string; carrier: string; destination: string; origin: string; scheduledAt: string; eta: string }[];
};

function DockInspector({ id, scene }: { id: string; scene: SceneData }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<DockDetail>(["inspect", "dock", id], `/api/docks/${id}`);
  const canShip = useCan("shipments:write");
  const canZones = useCan("zones:write");
  const [assignOpen, setAssign] = useState(false);
  const status = useApiMutation<{ status: string }>({ path: `/api/docks/${id}`, method: "PATCH", invalidate: LIVE, success: "Dock status updated" });
  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  const c = data.current;
  return (
    <>
      <Shell
        selection={{ kind: "dock", id }}
        scene={scene}
        title={data.name}
        subtitle={`${humanize(data.direction)} dock · ${data.code}`}
        badge={<Badge tone={data.status === "AVAILABLE" ? "success" : data.status === "OCCUPIED" ? "warning" : "danger"} dot>{humanize(data.status)}</Badge>}
        actions={
          <>
            {canShip && (
              <Button size="sm" onClick={() => setAssign(true)} disabled={data.status !== "AVAILABLE"}>
                <Truck /> Assign shipment
              </Button>
            )}
            {canZones && data.status !== "OCCUPIED" && (
              <Button size="sm" variant="outline" loading={status.isPending} onClick={() => status.mutate({ status: data.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE" })}>
                <Wrench /> {data.status === "MAINTENANCE" ? "Reopen dock" : "Maintenance"}
              </Button>
            )}
          </>
        }
      >
        {c ? (
          <div className="rounded-lg border border-line p-3 text-[13px]">
            <div className="flex items-center justify-between">
              <Link href={`/shipments?id=${c.id}`} className="font-semibold hover:text-brand-600">
                {c.trackingNumber}
              </Link>
              <span className="flex items-center gap-1">
                {c.simulated && <SimBadge />}
                <Badge tone={SHIPMENT_STATUS[c.status]?.tone}>{shipmentStatusLabel(c.status, c.direction)}</Badge>
              </span>
            </div>
            <div className="mt-1 text-xs text-ink-muted">
              {c.direction === "INBOUND" ? `From ${c.origin}` : `To ${c.destination}`} · {c.vehicle?.code ?? c.carrier}
            </div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-ink-muted">{c.direction === "INBOUND" ? "Unloading" : "Loading"}</span>
              <span className="font-semibold tabular">{c.loadingProgress}%</span>
            </div>
            <ProgressBar value={c.loadingProgress} className="mt-1" />
            <div className="mt-3 space-y-0.5">
              <DetailRow label="Pallets">{c.palletCount}</DetailRow>
              <DetailRow label="Orders">{c._count.orders}</DetailRow>
              <DetailRow label="Driver">{c.driver ? `${c.driver.firstName} ${c.driver.lastName}` : "—"}</DetailRow>
              <DetailRow label={c.direction === "INBOUND" ? "Arrived" : "Est. departure"}>{fmtDateTime(c.eta)}</DetailRow>
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-surface-muted p-3 text-[13px] text-ink-muted">No vehicle at this dock.</p>
        )}
        <SectionTitle>{data.direction === "INBOUND" ? "Expected arrivals" : "Planned departures"}</SectionTitle>
        {data.upcoming.length === 0 ? (
          <p className="text-xs text-ink-muted">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.upcoming.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                <Link href={`/shipments?id=${s.id}`} className="font-medium hover:text-brand-600">
                  {s.trackingNumber}
                </Link>
                <span className="truncate text-ink-muted">
                  {data.direction === "INBOUND" ? s.origin : s.destination} · {fmtDateTime(data.direction === "INBOUND" ? s.eta : s.scheduledAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Shell>
      {assignOpen && <AssignShipmentDialog open={assignOpen} onOpenChange={setAssign} dock={data} />}
    </>
  );
}

// ───────────────────────────── Zone ─────────────────────────────

type ZoneDetail = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  temperatureC: number | null;
  notes: string | null;
  capacity: number;
  occupied: number;
  blocked: number;
  units: number;
  damagedUnits: number;
  openOperations: number;
  topProducts: { id: string; quantity: number; damaged: number; product: { id: string; name: string; sku: string } }[];
  staff: { id: string; firstName: string; lastName: string; role: string; status: string }[];
  tasks: { id: string; number: string; type: string; status: string; description: string }[];
};

function ZoneInspector({ id, scene }: { id: string; scene: SceneData }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<ZoneDetail>(["inspect", "zone", id], `/api/zones/${id}`);
  const canWrite = useCan("zones:write");
  const [statusOpen, setStatusOpen] = useState(false);
  if (isLoading) return <Loading />;
  if (isError || !data) return <ErrorState message={error?.message} onRetry={() => refetch()} />;
  const pct = data.capacity ? (data.occupied / data.capacity) * 100 : 0;
  return (
    <>
      <Shell
        selection={{ kind: "zone", id }}
        scene={scene}
        title={data.name}
        subtitle={`${ZONE_TYPE[data.type]} · ${data.code}`}
        badge={<StatusBadge map={ZONE_STATUS} value={data.status} />}
        actions={
          <>
            {canWrite && (
              <Button size="sm" onClick={() => setStatusOpen(true)}>
                Change status
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href={`/zones?id=${data.id}`}>
                <ExternalLink /> Zone details
              </Link>
            </Button>
          </>
        }
      >
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-ink-muted">Occupancy</span>
          <span className="font-semibold tabular">
            {data.occupied}/{data.capacity} positions · {pct.toFixed(0)}%
          </span>
        </div>
        <ProgressBar value={pct} tone="auto" label="Zone occupancy" />
        <div className="mt-3">
          <DetailRow label="Units in stock">{fmtNumber(data.units)}</DetailRow>
          {data.damagedUnits > 0 && <DetailRow label="Damaged units">{fmtNumber(data.damagedUnits)}</DetailRow>}
          <DetailRow label="Open operations">{data.openOperations}</DetailRow>
          {data.blocked > 0 && <DetailRow label="Blocked positions">{data.blocked}</DetailRow>}
          {data.temperatureC != null && <DetailRow label="Temperature">{data.temperatureC} °C</DetailRow>}
          <DetailRow label="Staff assigned">{data.staff.length}</DetailRow>
        </div>
        {data.notes && <p className="mt-2 rounded-lg bg-surface-muted p-2.5 text-xs text-ink-muted">{data.notes}</p>}
        {data.topProducts.length > 0 && (
          <>
            <SectionTitle>Top stock</SectionTitle>
            <ul className="space-y-1.5">
              {data.topProducts.slice(0, 5).map((i) => (
                <li key={i.id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{i.product.name}</span>
                  <span className="shrink-0 text-ink-muted tabular">{fmtNumber(i.quantity || i.damaged)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Shell>
      {statusOpen && <ZoneStatusDialog open={statusOpen} onOpenChange={setStatusOpen} zone={data} />}
    </>
  );
}

export function Inspector({ scene }: { scene: SceneData }) {
  const selection = useSceneStore((s) => s.selection);
  if (!selection) return null;
  const key = `${selection.kind}-${selection.id}`;
  switch (selection.kind) {
    case "pallet":
      return <PalletInspector key={key} id={selection.id} scene={scene} />;
    case "rack":
      return <RackInspector key={key} id={selection.id} scene={scene} />;
    case "vehicle":
      return <VehicleInspector key={key} id={selection.id} scene={scene} />;
    case "dock":
      return <DockInspector key={key} id={selection.id} scene={scene} />;
    case "zone":
      return <ZoneInspector key={key} id={selection.id} scene={scene} />;
  }
}
