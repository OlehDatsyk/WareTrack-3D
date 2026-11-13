"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Truck, XCircle } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { fmtCurrency, fmtDateTime, fmtRelative } from "@/lib/format";
import { ORDER_FLOW, ORDER_STATUS, PRIORITY, SHIPMENT_STATUS, TASK_STATUS, TASK_TYPE } from "@/lib/status";
import { ORDER_ACTION_LABEL, ORDER_TRANSITIONS } from "@/lib/workflows";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { ConfirmDialog, Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ProgressBar, Skeleton, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { DetailRow, ErrorState, SectionTitle, StatusBadge } from "@/components/common/states";

type OrderDetail = {
  id: string;
  number: string;
  status: string;
  priority: string;
  notes: string | null;
  createdAt: string;
  requiredDispatchAt: string;
  dispatchedAt: string | null;
  simulated: boolean;
  value: number;
  customer: { name: string; city: string | null; email: string | null };
  items: { id: string; quantity: number; pickedQty: number; available: number; product: { id: string; sku: string; name: string; unit: string } }[];
  tasks: { id: string; number: string; type: string; status: string; progress: number; assignee: { firstName: string; lastName: string } | null }[];
  shipment: { id: string; trackingNumber: string; status: string; destination: string; vehicle: { code: string } | null; dock: { name: string } | null } | null;
  timeline: { id: string; at: string; text: string; actor: string | null; simulated: boolean }[];
};

const INVALIDATE = [["orders"], ["dashboard"], ["inventory"], ["tasks"], ["shipments"], ["scene"]] as const;

function toLocalInput(d: string) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

function EditOrderDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [priority, setPriority] = useState(order.priority);
  const [required, setRequired] = useState(toLocalInput(order.requiredDispatchAt));
  const [notes, setNotes] = useState(order.notes ?? "");
  const save = useApiMutation<void>({
    method: "PATCH",
    path: `/api/orders/${order.id}`,
    body: () => ({ priority, requiredDispatchAt: new Date(required).toISOString(), notes: notes || null }),
    invalidate: INVALIDATE,
    success: "Order updated",
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Edit ${order.number}`}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!required}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Priority" htmlFor="eo-p">
            <NativeSelect id="eo-p" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Required dispatch" htmlFor="eo-d">
            <Input id="eo-d" type="datetime-local" value={required} onChange={(e) => setRequired(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="eo-n">
            <Textarea id="eo-n" rows={3} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignShipmentDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [shipmentId, setShipmentId] = useState(order.shipment?.id ?? "");
  const shipments = useApiQuery<{ items: { id: string; trackingNumber: string; status: string; destination: string }[] }>(["shipments", "assignable"], "/api/shipments", {
    direction: "OUTBOUND",
    active: "true",
    pageSize: 50,
  });
  const options = (shipments.data?.items ?? []).filter((s) => ["PLANNED", "AT_DOCK", "LOADING"].includes(s.status));
  const save = useApiMutation<void>({
    path: `/api/orders/${order.id}/shipment`,
    body: () => ({ shipmentId: shipmentId || null }),
    invalidate: INVALIDATE,
    success: shipmentId ? "Order assigned to shipment" : "Order removed from shipment",
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Assign ${order.number} to a shipment`}
        description="Outbound shipments that have not departed yet."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Shipment" htmlFor="as-sh">
          <NativeSelect id="as-sh" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
            <option value="">Not assigned</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.trackingNumber} — {s.destination} ({s.status.toLowerCase().replace("_", " ")})
              </option>
            ))}
          </NativeSelect>
        </Field>
      </DialogContent>
    </Dialog>
  );
}

export function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<OrderDetail>(["orders", "detail", id], id ? `/api/orders/${id}` : null);
  const canStatus = useCan("orders:status");
  const canWrite = useCan("orders:write");
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "cancel">(null);
  const status = useApiMutation<{ status: string }>({
    path: `/api/orders/${id}/status`,
    invalidate: INVALIDATE,
    success: (_, i) => `Order moved to ${ORDER_STATUS[i.status]?.label.toLowerCase()}`,
    onSuccess: () => setDialog(null),
  });

  const next = data ? (ORDER_TRANSITIONS[data.status as keyof typeof ORDER_TRANSITIONS] ?? []) : [];
  const forward = next.filter((s) => s !== "CANCELLED" && s !== "PENDING" && !(s === "PACKING" && data?.status === "READY_FOR_DISPATCH"));
  const back = next.filter((s) => s === "PENDING" || (s === "PACKING" && data?.status === "READY_FOR_DISPATCH"));
  const stepIdx = data ? ORDER_FLOW.indexOf(data.status as (typeof ORDER_FLOW)[number]) : -1;
  const units = data?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const picked = data?.items.reduce((s, i) => s + i.pickedQty, 0) ?? 0;

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-2xl"
      title={data ? `Order ${data.number}` : "Order"}
      description={
        data && (
          <span className="flex flex-wrap items-center gap-2">
            {data.customer.name}
            <StatusBadge map={ORDER_STATUS} value={data.status} />
            <Badge tone={PRIORITY[data.priority]?.tone}>{PRIORITY[data.priority]?.label} priority</Badge>
            {data.simulated && <SimBadge />}
          </span>
        )
      }
      footer={
        data && (
          <>
            {canStatus && next.includes("CANCELLED") && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("cancel")}>
                <XCircle /> Cancel order
              </Button>
            )}
            {canWrite && !["DELIVERED", "CANCELLED"].includes(data.status) && (
              <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                <Pencil /> Edit
              </Button>
            )}
            {canWrite && !["DISPATCHED", "DELIVERED", "CANCELLED"].includes(data.status) && (
              <Button variant="outline" size="sm" onClick={() => setDialog("assign")}>
                <Truck /> {data.shipment ? "Change shipment" : "Assign shipment"}
              </Button>
            )}
            {canStatus &&
              back.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => status.mutate({ status: s })} loading={status.isPending && status.variables?.status === s}>
                  {ORDER_ACTION_LABEL[s]}
                </Button>
              ))}
            {canStatus &&
              forward.map((s) => (
                <Button key={s} size="sm" onClick={() => status.mutate({ status: s })} loading={status.isPending && status.variables?.status === s}>
                  <Check /> {ORDER_ACTION_LABEL[s]}
                </Button>
              ))}
          </>
        )
      }
    >
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || !data ? (
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      ) : (
        <>
          {data.status !== "CANCELLED" ? (
            <ol className="mb-5 flex items-center" aria-label="Order progress">
              {ORDER_FLOW.map((s, i) => (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                        i < stepIdx ? "border-brand-600 bg-brand-600 text-white" : i === stepIdx ? "border-brand-600 bg-white text-brand-700" : "border-slate-300 bg-white text-ink-subtle",
                      )}
                      aria-current={i === stepIdx ? "step" : undefined}
                    >
                      {i < stepIdx ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn("w-16 text-center text-[10px] leading-tight", i === stepIdx ? "font-semibold text-ink" : "text-ink-muted")}>{ORDER_STATUS[s]?.label}</span>
                  </div>
                  {i < ORDER_FLOW.length - 1 && <div className={cn("mb-5 h-0.5 flex-1", i < stepIdx ? "bg-brand-600" : "bg-slate-200")} />}
                </li>
              ))}
            </ol>
          ) : (
            <div className="mb-5 rounded-lg border border-red-200 bg-danger-soft px-3 py-2 text-[13px] text-red-700">This order was cancelled.</div>
          )}

          <div className="grid gap-x-8 sm:grid-cols-2">
            <div>
              <DetailRow label="Customer">{data.customer.name}</DetailRow>
              <DetailRow label="Ship to">{data.customer.city ?? "—"}</DetailRow>
              <DetailRow label="Order value">{fmtCurrency(data.value)}</DetailRow>
            </div>
            <div>
              <DetailRow label="Created">{fmtDateTime(data.createdAt)}</DetailRow>
              <DetailRow label="Required dispatch">
                <span className={cn(new Date(data.requiredDispatchAt) < new Date() && !["DISPATCHED", "DELIVERED", "CANCELLED"].includes(data.status) && "text-danger")}>
                  {fmtDateTime(data.requiredDispatchAt)}
                </span>
              </DetailRow>
              <DetailRow label="Dispatched">{fmtDateTime(data.dispatchedAt)}</DetailRow>
            </div>
          </div>
          {data.notes && <p className="mt-3 rounded-lg bg-surface-muted p-3 text-[13px] text-ink-muted">{data.notes}</p>}

          <SectionTitle>
            Lines · {picked}/{units} units picked
          </SectionTitle>
          <ProgressBar value={units ? (picked / units) * 100 : 0} className="mb-3" label="Picking progress" />
          <div className="overflow-hidden rounded-xl border border-line">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Picked</TH>
                  <TH className="text-right">Available</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((i) => (
                  <TR key={i.id}>
                    <TD>
                      <Link href={`/inventory?product=${i.product.id}`} className="font-medium hover:text-brand-600">
                        {i.product.name}
                      </Link>
                      <div className="font-mono text-[11px] text-ink-muted">{i.product.sku}</div>
                    </TD>
                    <TD className="text-right tabular">
                      {i.quantity} {i.product.unit}
                    </TD>
                    <TD className="text-right tabular">{i.pickedQty}</TD>
                    <TD className={cn("text-right tabular", i.available < i.quantity - i.pickedQty && ["PENDING", "PROCESSING"].includes(data.status) && "font-semibold text-danger")}>{i.available}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {data.shipment && (
            <>
              <SectionTitle>Shipment</SectionTitle>
              <Link href={`/shipments?id=${data.shipment.id}`} className="flex items-center justify-between rounded-xl border border-line p-3 text-[13px] hover:bg-surface-muted">
                <span>
                  <span className="font-semibold">{data.shipment.trackingNumber}</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {data.shipment.destination}
                    {data.shipment.vehicle ? ` · ${data.shipment.vehicle.code}` : ""}
                    {data.shipment.dock ? ` · ${data.shipment.dock.name}` : ""}
                  </span>
                </span>
                <StatusBadge map={SHIPMENT_STATUS} value={data.shipment.status} />
              </Link>
            </>
          )}

          {data.tasks.length > 0 && (
            <>
              <SectionTitle>Tasks</SectionTitle>
              <ul className="space-y-2">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
                    <span className="font-semibold">{t.number}</span>
                    <span className="text-ink-muted">{TASK_TYPE[t.type]}</span>
                    {t.assignee && <span className="text-ink-muted">· {t.assignee.firstName} {t.assignee.lastName}</span>}
                    <span className="ml-auto">
                      <StatusBadge map={TASK_STATUS} value={t.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionTitle>History</SectionTitle>
          {data.timeline.length === 0 ? (
            <p className="text-xs text-ink-muted">No recorded events yet.</p>
          ) : (
            <ol className="space-y-2 border-l border-line pl-4">
              {data.timeline.map((t) => (
                <li key={t.id} className="relative text-[13px]">
                  <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-500" />
                  <div>{t.text}</div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-ink-subtle">
                    {fmtRelative(t.at)} {t.actor && `· ${t.actor}`} {t.simulated && <SimBadge />}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {dialog === "edit" && <EditOrderDialog order={data} onClose={() => setDialog(null)} />}
          {dialog === "assign" && <AssignShipmentDialog order={data} onClose={() => setDialog(null)} />}
          <ConfirmDialog
            open={dialog === "cancel"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Cancel ${data.number}?`}
            description="Reserved stock is released, picked units are returned to the pick face and open tasks are cancelled. This cannot be undone."
            confirmLabel="Cancel order"
            destructive
            loading={status.isPending}
            onConfirm={() => status.mutate({ status: "CANCELLED" })}
          />
        </>
      )}
    </Sheet>
  );
}
