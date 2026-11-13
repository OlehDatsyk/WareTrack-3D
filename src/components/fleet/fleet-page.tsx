"use client";
import { useState } from "react";
import Link from "next/link";
import { BatteryCharging, Boxes, ClipboardCheck, Forklift, Pencil, Plus, Search, Trash2, Truck, Wrench } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { useDebounced, useNow, usePage, useUrlParam } from "@/lib/hooks";
import { fmtCurrency, fmtDate, fmtNumber, humanize } from "@/lib/format";
import { SHIPMENT_STATUS, TASK_STATUS, TASK_TYPE, VEHICLE_STATUS, VEHICLE_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Sheet } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { ProgressBar, Skeleton, TBody, TD, TH, THead, TR, Table, Tabs, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { DetailRow, EmptyState, ErrorState, PageHeader, Pagination, SectionTitle, StatusBadge, TableSkeleton } from "@/components/common/states";
import { AssignTaskDialog } from "@/components/warehouse/action-dialogs";
import { MaintenanceDialog, VehicleFormDialog } from "./vehicle-forms";

type Row = {
  id: string;
  code: string;
  type: string;
  model: string;
  status: string;
  energyType: string;
  energyLevel: number;
  locationLabel: string;
  onSite: boolean;
  nextServiceDue: string | null;
  registration: string | null;
  operator: { id: string; firstName: string; lastName: string } | null;
  tasks: { id: string; number: string; description: string; progress: number }[];
  shipments: { id: string; trackingNumber: string; status: string; destination: string }[];
};

type Detail = Omit<Row, "tasks" | "shipments" | "operator"> & {
  carrier: string | null;
  hoursUsed: number;
  lastServiceAt: string | null;
  operatorId: string | null;
  operator: { id: string; firstName: string; lastName: string; role: string; status: string } | null;
  tasks: { id: string; number: string; type: string; status: string; description: string; progress: number; simulated: boolean; completedAt: string | null }[];
  shipments: { id: string; trackingNumber: string; status: string; destination: string; eta: string; direction: string }[];
  maintenance: { id: string; type: string; description: string; cost: string; status: string; performedBy: string | null; performedAt: string }[];
};

const LIFTS = ["FORKLIFT", "REACH_TRUCK", "PALLET_JACK"];
const INVALIDATE = [["fleet"], ["inspect"], ["scene"], ["dashboard"]] as const;

function VehicleDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<Detail>(["fleet", "detail", id], id ? `/api/vehicles/${id}` : null);
  const canWrite = useCan("fleet:write");
  const canAssign = useCan("fleet:assign");
  const [dialog, setDialog] = useState<null | "edit" | "maintenance" | "assign" | "delete">(null);
  const charge = useApiMutation<void>({ path: `/api/vehicles/${id}/charge`, invalidate: INVALIDATE, success: "Sent to the charging bay" });
  const setStatus = useApiMutation<{ status: string }>({ method: "PATCH", path: `/api/vehicles/${id}`, invalidate: INVALIDATE, success: (_, i) => `Status set to ${humanize(i.status)}` });
  const del = useApiMutation<void>({
    method: "DELETE",
    path: `/api/vehicles/${id}`,
    invalidate: INVALIDATE,
    success: "Vehicle removed",
    onSuccess: () => {
      setDialog(null);
      onClose();
    },
  });
  const lift = data && LIFTS.includes(data.type);
  const now = useNow();
  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-xl"
      title={data ? `${data.code} · ${data.model}` : "Vehicle"}
      description={
        data && (
          <span className="flex items-center gap-2">
            {VEHICLE_TYPE[data.type]}
            <StatusBadge map={VEHICLE_STATUS} value={data.status} />
          </span>
        )
      }
      footer={
        data && (
          <>
            {canWrite && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("delete")}>
                <Trash2 /> Remove
              </Button>
            )}
            {data.onSite && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/warehouse?select=vehicle:${data.id}`}>
                  <Boxes /> Show in 3D
                </Link>
              </Button>
            )}
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("maintenance")}>
                  <Wrench /> Log maintenance
                </Button>
              </>
            )}
            {lift && canAssign && data.energyType === "ELECTRIC" && (
              <Button variant="outline" size="sm" onClick={() => charge.mutate()} disabled={data.status !== "AVAILABLE"} loading={charge.isPending}>
                <BatteryCharging /> Charge
              </Button>
            )}
            {lift && canAssign && (
              <Button size="sm" onClick={() => setDialog("assign")} disabled={data.status !== "AVAILABLE"}>
                <ClipboardCheck /> Assign task
              </Button>
            )}
          </>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : isError || !data ? (
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="rounded-xl border border-line p-4">
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-ink-muted">{data.energyType === "ELECTRIC" ? "Battery level" : "Fuel level"}</span>
              <span className="font-semibold tabular">{data.energyLevel}%</span>
            </div>
            <ProgressBar value={data.energyLevel} tone="energy" label="Energy level" />
          </div>
          <div className="mt-4">
            <DetailRow label={lift ? "Operator" : "Driver"}>{data.operator ? `${data.operator.firstName} ${data.operator.lastName}` : "Unassigned"}</DetailRow>
            <DetailRow label="Location">{data.locationLabel}</DetailRow>
            {data.registration && <DetailRow label="Registration">{data.registration}</DetailRow>}
            {data.carrier && <DetailRow label="Carrier">{data.carrier}</DetailRow>}
            <DetailRow label={lift ? "Operating hours" : "Odometer (km)"}>{fmtNumber(data.hoursUsed)}</DetailRow>
            <DetailRow label="Last service">{fmtDate(data.lastServiceAt)}</DetailRow>
            <DetailRow label="Next service due">
              <span className={cn(data.nextServiceDue && new Date(data.nextServiceDue).getTime() < now + 3 * 86_400_000 && "font-semibold text-amber-700")}>{fmtDate(data.nextServiceDue)}</span>
            </DetailRow>
          </div>
          {canWrite && data.status !== "IN_USE" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[13px] text-ink-muted">Set status</span>
              <NativeSelect
                value={data.status}
                onChange={(e) => setStatus.mutate({ status: e.target.value })}
                className="w-48"
                aria-label="Vehicle status"
                disabled={setStatus.isPending}
              >
                {["AVAILABLE", "CHARGING", "MAINTENANCE", "OUT_OF_SERVICE"].map((s) => (
                  <option key={s} value={s}>
                    {VEHICLE_STATUS[s]?.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {data.tasks.length > 0 && (
            <>
              <SectionTitle>Recent tasks</SectionTitle>
              <ul className="space-y-1.5">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
                    <span className="font-semibold">{t.number}</span>
                    <span className="truncate text-ink-muted">{TASK_TYPE[t.type]}</span>
                    {t.simulated && <SimBadge />}
                    <span className="ml-auto">
                      <StatusBadge map={TASK_STATUS} value={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {data.shipments.length > 0 && (
            <>
              <SectionTitle>Shipments</SectionTitle>
              <ul className="space-y-1.5">
                {data.shipments.map((s) => (
                  <li key={s.id}>
                    <Link href={`/shipments?id=${s.id}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-surface-muted">
                      <span className="font-semibold">{s.trackingNumber}</span>
                      <span className="truncate text-ink-muted">{s.destination}</span>
                      <span className="ml-auto">
                        <StatusBadge map={SHIPMENT_STATUS} value={s.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <SectionTitle>Maintenance history</SectionTitle>
          {data.maintenance.length === 0 ? (
            <p className="text-xs text-ink-muted">No maintenance recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.maintenance.map((m) => (
                <li key={m.id} className="rounded-lg border border-line px-3 py-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.type}</span>
                    <Badge tone={m.status === "COMPLETED" ? "success" : m.status === "IN_PROGRESS" ? "warning" : "neutral"}>{humanize(m.status)}</Badge>
                  </div>
                  <div className="text-xs text-ink-muted">{m.description}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-subtle">
                    {fmtDate(m.performedAt)} · {m.performedBy ?? "—"} · {fmtCurrency(Number(m.cost))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {dialog === "edit" && <VehicleFormDialog open onOpenChange={() => setDialog(null)} vehicle={data} />}
          {dialog === "maintenance" && <MaintenanceDialog vehicle={data} onClose={() => setDialog(null)} />}
          {dialog === "assign" && <AssignTaskDialog open onOpenChange={() => setDialog(null)} vehicle={data} />}
          <ConfirmDialog
            open={dialog === "delete"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Remove ${data.code} from the fleet?`}
            description="Its maintenance history is deleted. Vehicles with open tasks or shipments cannot be removed."
            confirmLabel="Remove vehicle"
            destructive
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}

export function FleetPage() {
  const [id, setId] = useUrlParam("id");
  const [group, setGroup] = useState<"lifts" | "road">("lifts");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = useCan("fleet:write");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage([q, group, status]);
  const list = useApiQuery<{ items: Row[]; total: number; summary: Record<string, number> }>(
    ["fleet", "list"],
    "/api/vehicles",
    { group, status, q, page, pageSize: 20 },
    { placeholderData: (p) => p, refetchInterval: 10_000 },
  );
  const summary = list.data?.summary ?? {};
  const now = useNow();

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Fleet management"
        description="Forklifts, reach trucks, trucks and vans — status, energy, assignments and maintenance."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Add vehicle
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(VEHICLE_STATUS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(status === k ? "" : k)}
            className={cn("rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card", status === k ? "border-brand-400 ring-2 ring-brand-100" : "border-line hover:border-line-strong")}
          >
            <Badge tone={v.tone} dot>
              {v.label}
            </Badge>
            <div className="mt-2 text-2xl font-semibold tabular">{summary[k] ?? 0}</div>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <Tabs value={group} onValueChange={(v) => setGroup(v as "lifts" | "road")}>
            <TabsList>
              <TabsTrigger value="lifts">
                <Forklift className="size-3.5" /> Warehouse vehicles
              </TabsTrigger>
              <TabsTrigger value="road">
                <Truck className="size-3.5" /> Trucks & vans
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vehicle ID, model or registration…" className="pl-9" aria-label="Search vehicles" />
          </div>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState title="No vehicles" icon={<Forklift />} description="Nothing matches these filters." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Vehicle</TH>
                  <TH>Status</TH>
                  <TH>{group === "lifts" ? "Operator" : "Driver"}</TH>
                  <TH>{group === "lifts" ? "Battery" : "Fuel"}</TH>
                  <TH>Location</TH>
                  <TH>Current assignment</TH>
                  <TH>Next service</TH>
                </TR>
              </THead>
              <TBody>
                {list.data!.items.map((v) => {
                  const task = v.tasks[0];
                  const ship = v.shipments[0];
                  const due = v.nextServiceDue && new Date(v.nextServiceDue).getTime() < now + 3 * 86_400_000;
                  return (
                    <TR key={v.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => setId(v.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setId(v.id)}>
                      <TD>
                        <div className="font-semibold">{v.code}</div>
                        <div className="text-xs text-ink-muted">
                          {VEHICLE_TYPE[v.type]} · {v.model}
                        </div>
                      </TD>
                      <TD>
                        <StatusBadge map={VEHICLE_STATUS} value={v.status} />
                      </TD>
                      <TD className="whitespace-nowrap">{v.operator ? `${v.operator.firstName} ${v.operator.lastName}` : <span className="text-ink-subtle">Unassigned</span>}</TD>
                      <TD className="w-36">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={v.energyLevel} tone="energy" className="flex-1" label={`${v.code} energy`} />
                          <span className="w-9 text-right text-xs tabular">{v.energyLevel}%</span>
                        </div>
                      </TD>
                      <TD className="text-ink-muted">{v.locationLabel}</TD>
                      <TD className="max-w-[260px] truncate text-ink-muted">
                        {task ? `${task.number} · ${task.description}` : ship ? `${ship.trackingNumber} → ${ship.destination}` : "—"}
                      </TD>
                      <TD className={cn("whitespace-nowrap", due ? "font-semibold text-amber-700" : "text-ink-muted")}>{fmtDate(v.nextServiceDue)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
      <VehicleDrawer id={id} onClose={() => setId(null)} />
      {createOpen && <VehicleFormDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}
