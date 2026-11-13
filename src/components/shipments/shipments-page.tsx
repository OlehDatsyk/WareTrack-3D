"use client";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Map as MapIcon, Plus, Search, Truck } from "lucide-react";
import { useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { useDebounced, usePage, useUrlParam } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { SHIPMENT_STATUS, shipmentStatusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { ProgressBar, Skeleton, TBody, TD, TH, THead, TR, Table, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from "@/components/common/states";
import { RouteMap, type MapRoute } from "./route-map";
import { ShipmentDrawer } from "./shipment-drawer";
import { CreateShipmentDialog } from "./shipment-dialogs";

type Row = {
  id: string;
  trackingNumber: string;
  direction: string;
  status: string;
  carrier: string;
  origin: string;
  destination: string;
  scheduledAt: string;
  eta: string;
  loadingProgress: number;
  routeProgress: number;
  simulated: boolean;
  vehicle: { code: string } | null;
  driver: { firstName: string; lastName: string } | null;
  dock: { name: string } | null;
  _count: { orders: number };
};

export function ShipmentsPage() {
  const [id, setId] = useUrlParam("id");
  const [direction, setDirection] = useState<"ALL" | "OUTBOUND" | "INBOUND">("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = useCan("shipments:write");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage([q, direction, status]);

  const list = useApiQuery<{ items: Row[]; total: number; counts: Record<string, number> }>(
    ["shipments", "list"],
    "/api/shipments",
    {
      q,
      direction: direction === "ALL" ? undefined : direction,
      status: status === "ACTIVE" || status === "ALL" ? undefined : status,
      active: status === "ACTIVE" ? "true" : undefined,
      page,
      pageSize: 15,
    },
    { placeholderData: (p) => p },
  );
  const map = useApiQuery<{ origin: { name: string; x: number; y: number }; routes: MapRoute[] }>(["shipments", "map"], "/api/shipments/map", undefined, {
    refetchInterval: 10_000,
  });
  const counts = list.data?.counts ?? {};

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Shipments"
        description="Inbound and outbound shipments, dock assignments and delivery tracking."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Plan shipment
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Vehicles on the road" description="Click a vehicle to open its shipment" icon={<MapIcon />} />
          <div className="h-[300px] border-t border-line p-3">
            {map.data ? <RouteMap className="h-full" origin={map.data.origin} routes={map.data.routes} selectedId={id} onSelect={setId} /> : <Skeleton className="h-full w-full" />}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          {[
            { key: "LOADING", label: "Loading / unloading", icon: Truck },
            { key: "IN_TRANSIT", label: "In transit", icon: ArrowUpFromLine },
            { key: "DELAYED", label: "Delayed", icon: Truck, danger: true },
            { key: "PLANNED", label: "Planned", icon: ArrowDownToLine },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card hover:border-line-strong",
                status === t.key ? "border-brand-400 ring-2 ring-brand-100" : "border-line",
              )}
            >
              <span className={cn("flex size-10 items-center justify-center rounded-xl", t.danger && (counts[t.key] ?? 0) > 0 ? "bg-danger-soft text-danger" : "bg-brand-50 text-brand-600")}>
                <t.icon className="size-5" />
              </span>
              <span>
                <span className="block text-[12.5px] text-ink-muted">{t.label}</span>
                <span className="block text-xl font-semibold tabular">{counts[t.key] ?? 0}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Tabs value={direction} onValueChange={(v) => setDirection(v as typeof direction)}>
            <TabsList>
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="OUTBOUND">
                <ArrowUpFromLine className="size-3.5" /> Outbound
              </TabsTrigger>
              <TabsTrigger value="INBOUND">
                <ArrowDownToLine className="size-3.5" /> Inbound
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tracking number, city, carrier, vehicle…" className="pl-9" aria-label="Search shipments" />
          </div>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Status">
            <option value="ACTIVE">Active</option>
            <option value="ALL">All statuses</option>
            {Object.entries(SHIPMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState title="No shipments" icon={<Truck />} description="Nothing matches these filters." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Tracking</TH>
                  <TH>Route</TH>
                  <TH>Status</TH>
                  <TH>Carrier / vehicle</TH>
                  <TH>Dock</TH>
                  <TH>Progress</TH>
                  <TH>Scheduled</TH>
                  <TH>ETA</TH>
                </TR>
              </THead>
              <TBody>
                {list.data!.items.map((s) => {
                  const atDock = ["AT_DOCK", "LOADING", "READY"].includes(s.status);
                  return (
                    <TR key={s.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => setId(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setId(s.id)}>
                      <TD>
                        <span className="flex items-center gap-1.5 font-semibold">
                          {s.direction === "INBOUND" ? <ArrowDownToLine className="size-3.5 text-sky-600" /> : <ArrowUpFromLine className="size-3.5 text-brand-600" />}
                          {s.trackingNumber}
                          {s.simulated && <SimBadge />}
                        </span>
                        {s._count.orders > 0 && <span className="text-xs text-ink-muted">{s._count.orders} orders</span>}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <span className="text-ink-muted">{s.origin.split(",")[0]}</span> → <span className="font-medium">{s.destination.split(",")[0]}</span>
                      </TD>
                      <TD>
                        <Badge tone={SHIPMENT_STATUS[s.status]?.tone} dot>
                          {shipmentStatusLabel(s.status, s.direction)}
                        </Badge>
                      </TD>
                      <TD>
                        <div className="whitespace-nowrap">{s.carrier}</div>
                        <div className="text-xs text-ink-muted">{s.vehicle?.code ?? "—"}</div>
                      </TD>
                      <TD className="text-ink-muted">{s.dock?.name ?? "—"}</TD>
                      <TD className="w-32">
                        <ProgressBar value={atDock ? s.loadingProgress : s.routeProgress * 100} tone={s.status === "DELAYED" ? "danger" : s.status === "DELIVERED" ? "success" : "brand"} />
                        <div className="mt-0.5 text-[10.5px] text-ink-subtle">{atDock ? (s.direction === "INBOUND" ? "Unloading" : "Loading") : "Route"}</div>
                      </TD>
                      <TD className="whitespace-nowrap text-ink-muted">{fmtDateTime(s.scheduledAt)}</TD>
                      <TD className={cn("whitespace-nowrap", s.status === "DELAYED" ? "font-semibold text-danger" : "text-ink-muted")}>{fmtDateTime(s.eta)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={15} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
      <ShipmentDrawer id={id} onClose={() => setId(null)} />
      {createOpen && <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setId} />}
    </div>
  );
}
