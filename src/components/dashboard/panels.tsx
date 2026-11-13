"use client";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  Forklift,
  PackageCheck,
  Truck,
} from "lucide-react";
import type { DashboardData } from "@/server/services/dashboard";
import { fmtRelative, fmtTime } from "@/lib/format";
import { ORDER_STATUS, PRIORITY, SHIPMENT_STATUS, shipmentStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/primitives";
import { EmptyState, StatusBadge } from "@/components/common/states";
import { PRIORITY_DOT } from "@/components/alerts/notification-meta";

function ViewAll({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href}>
        {label} <ArrowRight />
      </Link>
    </Button>
  );
}

const ACTIVITY_ICON: Record<string, typeof Activity> = {
  task: Forklift,
  order: ClipboardList,
  shipment: Truck,
  vehicle: Truck,
  inventory: Boxes,
  pallet: Boxes,
};

export function ActivityFeed({ items }: { items: DashboardData["activity"] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader title="Recent warehouse activity" icon={<Activity />} action={<ViewAll href="/alerts?tab=activity" />} />
      {items.length === 0 ? (
        <EmptyState title="No activity yet" description="Operations will appear here as they happen." />
      ) : (
        <ol className="scrollbar-thin max-h-[360px] flex-1 overflow-y-auto px-5 pb-4">
          {items.map((a, i) => {
            const Icon = ACTIVITY_ICON[a.type.split(".")[0]!] ?? Activity;
            return (
              <li key={a.id} className="relative flex gap-3 pb-3.5">
                {i < items.length - 1 && <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line" />}
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-ink-muted">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[13px] leading-snug text-ink">{a.message}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
                    <span>{fmtRelative(a.createdAt)}</span>
                    {a.actorName && <span>· {a.actorName}</span>}
                    {a.simulated && <SimBadge />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

export function ActiveShipments({ items }: { items: DashboardData["shipments"] }) {
  return (
    <Card>
      <CardHeader title="Active shipments" description="Trailers at docks and vehicles on the road" icon={<Truck />} action={<ViewAll href="/shipments" />} />
      {items.length === 0 ? (
        <EmptyState title="No active shipments" />
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {items.map((s) => {
            const atDock = ["AT_DOCK", "LOADING", "READY"].includes(s.status);
            const progress = atDock ? s.loadingProgress : s.routeProgress * 100;
            const DirIcon = s.direction === "INBOUND" ? ArrowDownToLine : ArrowUpFromLine;
            return (
              <Link key={s.id} href={`/shipments?id=${s.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-muted">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", s.direction === "INBOUND" ? "bg-info-soft text-sky-700" : "bg-brand-50 text-brand-700")}>
                  <DirIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{s.trackingNumber}</span>
                    <Badge tone={SHIPMENT_STATUS[s.status]?.tone} dot>
                      {shipmentStatusLabel(s.status, s.direction)}
                    </Badge>
                    {s.simulated && <SimBadge />}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-muted">
                    {s.direction === "INBOUND" ? "From" : "To"} {s.destination} · {s.vehicle ?? s.carrier}
                    {s.dock ? ` · ${s.dock}` : ""}
                  </div>
                </div>
                <div className="hidden w-40 shrink-0 sm:block">
                  <div className="mb-1 flex justify-between text-[11px] text-ink-muted">
                    <span>{atDock ? (s.direction === "INBOUND" ? "Unloading" : "Loading") : "Route"}</span>
                    <span className="tabular">{Math.round(progress)}%</span>
                  </div>
                  <ProgressBar value={progress} tone={s.status === "DELAYED" ? "danger" : "brand"} />
                </div>
                <div className="w-16 shrink-0 text-right">
                  <div className="text-[11px] text-ink-muted">ETA</div>
                  <div className={cn("text-[13px] font-semibold tabular", s.status === "DELAYED" && "text-danger")}>{fmtTime(s.eta)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function PendingOrders({ items }: { items: DashboardData["pendingOrders"] }) {
  return (
    <Card>
      <CardHeader title="Pending orders" description="Waiting to be released or picked" icon={<ClipboardList />} action={<ViewAll href="/orders?status=PENDING" />} />
      {items.length === 0 ? (
        <EmptyState title="No pending orders" icon={<PackageCheck />} description="Every order is in progress or done." />
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {items.map((o) => (
            <Link key={o.id} href={`/orders?id=${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{o.number}</span>
                  <StatusBadge map={ORDER_STATUS} value={o.status} />
                  {o.simulated && <SimBadge />}
                </div>
                <div className="mt-0.5 truncate text-xs text-ink-muted">
                  {o.customer} · {o.lines} line{o.lines === 1 ? "" : "s"}
                </div>
              </div>
              <div className="text-right">
                <Badge tone={PRIORITY[o.priority]?.tone}>{PRIORITY[o.priority]?.label}</Badge>
                <div className={cn("mt-1 text-[11.5px] tabular", o.overdue ? "font-semibold text-danger" : "text-ink-muted")}>
                  {o.overdue ? "Overdue" : `Due ${fmtRelative(o.requiredDispatchAt)}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function CriticalAlerts({ items }: { items: DashboardData["alerts"] }) {
  return (
    <Card>
      <CardHeader title="Critical alerts" icon={<AlertTriangle />} action={<ViewAll href="/alerts?priority=HIGH" />} />
      {items.length === 0 ? (
        <EmptyState title="No critical alerts" description="Nothing needs urgent attention." className="py-8" />
      ) : (
        <ul className="space-y-2 px-5 pb-5">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={n.link ?? "/alerts"} className="flex gap-3 rounded-lg border border-line p-3 hover:border-line-strong hover:bg-surface-muted">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", PRIORITY_DOT[n.priority])} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold">{n.title}</span>
                    {n.simulated && <SimBadge />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">{n.message}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ZoneOccupancy({ zones }: { zones: DashboardData["zones"] }) {
  return (
    <Card>
      <CardHeader title="Zone occupancy" icon={<Boxes />} action={<ViewAll href="/zones" />} />
      <ul className="space-y-3 px-5 pb-5">
        {zones
          .filter((z) => z.capacity > 0)
          .map((z) => {
            const pct = (z.occupied / z.capacity) * 100;
            return (
              <li key={z.id}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="size-2 rounded-sm" style={{ background: z.color }} />
                    {z.name}
                    {z.status !== "ACTIVE" && <Badge tone="warning">{z.status.toLowerCase()}</Badge>}
                  </span>
                  <span className="text-ink-muted tabular">
                    {z.occupied}/{z.capacity} · {pct.toFixed(0)}%
                  </span>
                </div>
                <ProgressBar value={pct} tone="auto" label={`${z.name} occupancy`} />
              </li>
            );
          })}
      </ul>
    </Card>
  );
}
