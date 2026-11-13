"use client";
import { useState } from "react";
import Link from "next/link";
import { CircleDot, DoorOpen, Truck } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { ORDER_STATUS, SHIPMENT_STATUS, TASK_TYPE, shipmentStatusLabel } from "@/lib/status";
import { SHIPMENT_ACTION_LABEL, SHIPMENT_TRANSITIONS } from "@/lib/workflows";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { ProgressBar, Skeleton } from "@/components/ui/primitives";
import { DetailRow, ErrorState, SectionTitle, StatusBadge } from "@/components/common/states";
import { RouteMap } from "./route-map";
import { AssignDockDialog, AssignResourcesDialog } from "./shipment-dialogs";

type Detail = {
  id: string;
  trackingNumber: string;
  direction: string;
  status: string;
  carrier: string;
  origin: string;
  destination: string;
  destMapX: number;
  destMapY: number;
  routeProgress: number;
  loadingProgress: number;
  weightKg: number;
  palletCount: number;
  scheduledAt: string;
  eta: string;
  departedAt: string | null;
  deliveredAt: string | null;
  simulated: boolean;
  originMap: { x: number; y: number };
  vehicle: { id: string; code: string; model: string; registration: string | null } | null;
  driver: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  dock: { id: string; name: string } | null;
  events: { id: string; status: string; message: string; location: string | null; simulated: boolean; createdAt: string }[];
  orders: { id: string; number: string; status: string; customer: { name: string }; _count: { items: number } }[];
  tasks: { id: string; number: string; type: string; status: string; progress: number }[];
};

const INVALIDATE = [["shipments"], ["dashboard"], ["orders"], ["scene"], ["fleet"]] as const;

function DelayDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState("");
  const save = useApiMutation<void>({
    path: `/api/shipments/${id}/status`,
    body: () => ({ status: "DELAYED", delayMinutes: minutes, note: note || undefined }),
    invalidate: INVALIDATE,
    success: "Delay recorded",
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Report delay"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => save.mutate()} loading={save.isPending} disabled={minutes < 5}>
              Report delay
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Expected delay (minutes)" htmlFor="dl-m">
            <Input id="dl-m" type="number" min={5} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
          <Field label="Reason" htmlFor="dl-n">
            <Input id="dl-n" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Road closure on I-95" />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShipmentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<Detail>(["shipments", "detail", id], id ? `/api/shipments/${id}` : null);
  const canWrite = useCan("shipments:write");
  const [dialog, setDialog] = useState<null | "resources" | "dock" | "delay" | "cancel">(null);
  const status = useApiMutation<{ status: string }>({
    path: `/api/shipments/${id}/status`,
    invalidate: INVALIDATE,
    success: (_, i) => `Shipment ${SHIPMENT_STATUS[i.status]?.label.toLowerCase()}`,
    onSuccess: () => setDialog(null),
  });
  const next = data ? (SHIPMENT_TRANSITIONS[data.status as keyof typeof SHIPMENT_TRANSITIONS] ?? []) : [];
  const actions = next.filter((s) => s !== "CANCELLED" && s !== "DELAYED" && s !== "AT_DOCK");
  const preDeparture = data && ["PLANNED", "AT_DOCK", "LOADING", "READY"].includes(data.status);

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-2xl"
      title={data ? `Shipment ${data.trackingNumber}` : "Shipment"}
      description={
        data && (
          <span className="flex flex-wrap items-center gap-2">
            {data.direction === "INBOUND" ? `Inbound from ${data.origin}` : `Outbound to ${data.destination}`}
            <Badge tone={SHIPMENT_STATUS[data.status]?.tone} dot>
              {shipmentStatusLabel(data.status, data.direction)}
            </Badge>
            {data.simulated && <SimBadge />}
          </span>
        )
      }
      footer={
        data &&
        canWrite && (
          <>
            {next.includes("CANCELLED") && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("cancel")}>
                Cancel shipment
              </Button>
            )}
            {preDeparture && data.direction === "OUTBOUND" && (
              <Button variant="outline" size="sm" onClick={() => setDialog("resources")}>
                <Truck /> Truck & driver
              </Button>
            )}
            {(data.status === "PLANNED" || ((data.status === "IN_TRANSIT" || data.status === "DELAYED") && data.direction === "INBOUND")) && (
              <Button variant="outline" size="sm" onClick={() => setDialog("dock")}>
                <DoorOpen /> Assign dock
              </Button>
            )}
            {next.includes("DELAYED") && (
              <Button variant="outline" size="sm" onClick={() => setDialog("delay")}>
                Report delay
              </Button>
            )}
            {actions.map((s) => (
              <Button key={s} size="sm" onClick={() => status.mutate({ status: s })} loading={status.isPending && status.variables?.status === s}>
                {s === "DELIVERED" && data.direction === "INBOUND" ? "Confirm received" : s === "LOADING" && data.direction === "INBOUND" ? "Start unloading" : SHIPMENT_ACTION_LABEL[s]}
              </Button>
            ))}
          </>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : isError || !data ? (
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-line">
            <RouteMap
              className="h-56"
              origin={{ name: data.direction === "INBOUND" ? data.destination : data.origin, ...data.originMap }}
              routes={[
                {
                  id: data.id,
                  trackingNumber: data.trackingNumber,
                  direction: data.direction,
                  status: data.status,
                  label: data.vehicle?.code ?? data.carrier,
                  city: data.direction === "INBOUND" ? data.origin : data.destination,
                  x: data.destMapX,
                  y: data.destMapY,
                  progress: data.routeProgress,
                  eta: data.eta,
                },
              ]}
              selectedId={data.id}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-muted">{data.direction === "INBOUND" ? "Unloading" : "Loading"}</span>
                <span className="font-semibold tabular">{data.loadingProgress}%</span>
              </div>
              <ProgressBar value={data.loadingProgress} label="Loading progress" />
            </div>
            <div className="rounded-xl border border-line p-3">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-muted">Route (simulated)</span>
                <span className="font-semibold tabular">{Math.round(data.routeProgress * 100)}%</span>
              </div>
              <ProgressBar value={data.routeProgress * 100} tone={data.status === "DELAYED" ? "danger" : "brand"} label="Route progress" />
            </div>
          </div>

          <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <div>
              <DetailRow label="Carrier">{data.carrier}</DetailRow>
              <DetailRow label="Vehicle">{data.vehicle ? `${data.vehicle.code}${data.vehicle.registration ? ` · ${data.vehicle.registration}` : ""}` : "—"}</DetailRow>
              <DetailRow label="Driver">{data.driver ? `${data.driver.firstName} ${data.driver.lastName}` : "—"}</DetailRow>
              <DetailRow label="Dock">{data.dock?.name ?? "—"}</DetailRow>
            </div>
            <div>
              <DetailRow label="Scheduled">{fmtDateTime(data.scheduledAt)}</DetailRow>
              <DetailRow label="Departed">{fmtDateTime(data.departedAt)}</DetailRow>
              <DetailRow label={data.deliveredAt ? (data.direction === "INBOUND" ? "Received" : "Delivered") : "ETA"}>
                <span className={cn(data.status === "DELAYED" && "text-danger")}>{fmtDateTime(data.deliveredAt ?? data.eta)}</span>
              </DetailRow>
              <DetailRow label="Load">
                {data.palletCount} pallets · {fmtNumber(Math.round(data.weightKg))} kg
              </DetailRow>
            </div>
          </div>

          {data.orders.length > 0 && (
            <>
              <SectionTitle>Orders on this shipment</SectionTitle>
              <ul className="space-y-1.5">
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders?id=${o.id}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-surface-muted">
                      <span className="font-semibold">{o.number}</span>
                      <span className="truncate text-ink-muted">{o.customer.name}</span>
                      <span className="ml-auto">
                        <StatusBadge map={ORDER_STATUS} value={o.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.tasks.length > 0 && (
            <>
              <SectionTitle>Dock tasks</SectionTitle>
              <ul className="space-y-1.5">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
                    <span className="font-semibold">{t.number}</span>
                    <span className="text-ink-muted">{TASK_TYPE[t.type]}</span>
                    <ProgressBar value={t.progress} className="ml-auto w-24" />
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionTitle>Timeline</SectionTitle>
          <ol className="relative space-y-3 border-l-2 border-line pl-5">
            {data.events.map((ev, i) => (
              <li key={ev.id} className="relative">
                <span
                  className={cn(
                    "absolute top-0.5 -left-[27px] flex size-4 items-center justify-center rounded-full border-2 bg-white",
                    i === data.events.length - 1 ? (ev.status === "DELAYED" ? "border-danger" : "border-brand-600") : "border-slate-300",
                  )}
                >
                  {i === data.events.length - 1 && <CircleDot className={cn("size-2.5", ev.status === "DELAYED" ? "text-danger" : "text-brand-600")} />}
                </span>
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {shipmentStatusLabel(ev.status, data.direction)}
                  {ev.simulated && <SimBadge />}
                </div>
                <div className="text-xs text-ink-muted">{ev.message}</div>
                <div className="text-[11px] text-ink-subtle">
                  {fmtDateTime(ev.createdAt)}
                  {ev.location ? ` · ${ev.location}` : ""}
                </div>
              </li>
            ))}
          </ol>

          {dialog === "resources" && <AssignResourcesDialog shipment={data} onClose={() => setDialog(null)} />}
          {dialog === "dock" && <AssignDockDialog shipment={data} onClose={() => setDialog(null)} />}
          {dialog === "delay" && <DelayDialog id={data.id} onClose={() => setDialog(null)} />}
          <ConfirmDialog
            open={dialog === "cancel"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Cancel ${data.trackingNumber}?`}
            description="The dock is released, the truck returns to parking, orders are unassigned and open dock tasks are cancelled."
            confirmLabel="Cancel shipment"
            destructive
            loading={status.isPending}
            onConfirm={() => status.mutate({ status: "CANCELLED" })}
          />
        </>
      )}
    </Sheet>
  );
}
