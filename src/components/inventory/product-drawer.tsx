"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertOctagon, ArrowRightLeft, Boxes, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { fmtCurrency, fmtDate, fmtDateTime, fmtNumber } from "@/lib/format";
import { MOVEMENT_TYPE, ORDER_STATUS, PALLET_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { ConfirmDialog, Sheet } from "@/components/ui/dialog";
import { Skeleton, TBody, TD, TH, THead, TR, Table, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { DetailRow, EmptyState, ErrorState, StatusBadge } from "@/components/common/states";
import { ProductFormDialog } from "./product-form";
import { AdjustDialog, TransferDialog, ZoneDamageDialog } from "./stock-dialogs";

type Detail = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  unitWeightKg: number;
  unitCost: number;
  reorderLevel: number;
  reorderQty: number;
  supplierId: string | null;
  isActive: boolean;
  createdAt: string;
  supplier: { name: string; contactName: string | null; contactEmail: string | null; leadTimeDays: number } | null;
  totals: { onHand: number; reserved: number; available: number; damaged: number; openDemand: number };
  stock: { id: string; quantity: number; reserved: number; damaged: number; lastCountAt: string | null; zone: { id: string; name: string; code: string; type: string } }[];
  pallets: { id: string; code: string; quantity: number; status: string; lot: string | null; receivedAt: string; location: { code: string; zone: { name: string } } | null }[];
  movements: {
    id: string;
    type: string;
    quantity: number;
    reference: string | null;
    note: string | null;
    simulated: boolean;
    createdAt: string;
    fromZone: { name: string } | null;
    toZone: { name: string } | null;
    user: { name: string } | null;
  }[];
  demand: { id: string; quantity: number; pickedQty: number; order: { id: string; number: string; status: string } }[];
};

export function ProductDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<Detail>(["inventory", "product", id], id ? `/api/products/${id}` : null);
  const canAdjust = useCan("inventory:adjust");
  const canWrite = useCan("inventory:write");
  const canDelete = useCan("inventory:delete");
  const [dialog, setDialog] = useState<null | "adjust" | "transfer" | "damage" | "edit" | "delete">(null);
  const del = useApiMutation<void, { archived: boolean }>({
    method: "DELETE",
    path: `/api/products/${id}`,
    invalidate: [["inventory"]],
    success: (o) => (o.archived ? "Product archived (it has history)" : "Product deleted"),
    onSuccess: () => {
      setDialog(null);
      onClose();
    },
  });
  const low = data && data.totals.available < data.reorderLevel;

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-2xl"
      title={data ? data.name : "Product"}
      description={
        data ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{data.sku}</span>· {data.category}
            {!data.isActive && <Badge tone="neutral">Archived</Badge>}
            {low && <Badge tone={data.totals.available <= 0 ? "danger" : "warning"}>{data.totals.available <= 0 ? "Out of stock" : "Low stock"}</Badge>}
          </span>
        ) : undefined
      }
      footer={
        data && (
          <>
            {canDelete && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("delete")}>
                <Trash2 /> Delete
              </Button>
            )}
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                <Pencil /> Edit
              </Button>
            )}
            {canAdjust && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog("damage")}>
                  <AlertOctagon /> Damage
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("transfer")}>
                  <ArrowRightLeft /> Transfer
                </Button>
                <Button size="sm" onClick={() => setDialog("adjust")}>
                  <SlidersHorizontal /> Adjust
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : isError || !data ? (
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["On hand", data.totals.onHand],
              ["Reserved", data.totals.reserved],
              ["Available", data.totals.available],
              ["Damaged", data.totals.damaged],
              ["Open demand", data.totals.openDemand],
            ].map(([k, v]) => (
              <div key={k} className={cn("rounded-xl border border-line p-3", k === "Available" && low && "border-amber-200 bg-warning-soft")}>
                <div className="text-[11.5px] text-ink-muted">{k}</div>
                <div className="mt-0.5 text-lg font-semibold tabular">{fmtNumber(Number(v))}</div>
              </div>
            ))}
          </div>

          <Tabs defaultValue="stock" className="mt-5">
            <TabsList>
              <TabsTrigger value="stock">Stock by zone</TabsTrigger>
              <TabsTrigger value="pallets">Pallets ({data.pallets.length})</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">
              {data.stock.length === 0 ? (
                <EmptyState title="No stock recorded" description="Receive or adjust stock to create zone balances." />
              ) : (
                <div className="overflow-hidden rounded-xl border border-line">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Zone</TH>
                        <TH className="text-right">On hand</TH>
                        <TH className="text-right">Reserved</TH>
                        <TH className="text-right">Damaged</TH>
                        <TH>Last count</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.stock.map((s) => (
                        <TR key={s.id}>
                          <TD className="font-medium">{s.zone.name}</TD>
                          <TD className="text-right tabular">{fmtNumber(s.quantity)}</TD>
                          <TD className="text-right tabular">{fmtNumber(s.reserved)}</TD>
                          <TD className={cn("text-right tabular", s.damaged > 0 && "text-danger")}>{fmtNumber(s.damaged)}</TD>
                          <TD className="text-ink-muted">{fmtDate(s.lastCountAt)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
              {data.demand.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Open order demand</div>
                  <div className="flex flex-wrap gap-2">
                    {data.demand.map((d) => (
                      <Link key={d.id} href={`/orders?id=${d.order.id}`} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-surface-muted">
                        <span className="font-semibold">{d.order.number}</span>
                        <StatusBadge map={ORDER_STATUS} value={d.order.status} />
                        <span className="text-ink-muted tabular">{d.quantity - d.pickedQty} units</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pallets" className="mt-4">
              {data.pallets.length === 0 ? (
                <EmptyState title="No pallets" icon={<Boxes />} description="This product is only held as loose stock." />
              ) : (
                <div className="overflow-hidden rounded-xl border border-line">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Pallet</TH>
                        <TH>Location</TH>
                        <TH className="text-right">Qty</TH>
                        <TH>Status</TH>
                        <TH>Received</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.pallets.map((p) => (
                        <TR key={p.id} className="hover:bg-surface-muted">
                          <TD>
                            <Link href={`/warehouse?select=pallet:${p.id}`} className="font-medium text-brand-600 hover:underline">
                              {p.code}
                            </Link>
                          </TD>
                          <TD className="text-ink-muted">{p.location ? `${p.location.zone.name} · ${p.location.code}` : "—"}</TD>
                          <TD className="text-right tabular">{p.quantity}</TD>
                          <TD>
                            <StatusBadge map={PALLET_STATUS} value={p.status} />
                          </TD>
                          <TD className="text-ink-muted">{fmtDate(p.receivedAt)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {data.movements.length === 0 ? (
                <EmptyState title="No movements yet" />
              ) : (
                <ol className="space-y-2">
                  {data.movements.map((m) => (
                    <li key={m.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
                      <StatusBadge map={MOVEMENT_TYPE} value={m.type} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div>
                          <span className={cn("font-semibold tabular", m.quantity < 0 ? "text-danger" : "text-green-700")}>
                            {m.quantity > 0 ? "+" : ""}
                            {fmtNumber(m.quantity)}
                          </span>{" "}
                          <span className="text-ink-muted">
                            {m.fromZone?.name ?? ""}
                            {m.fromZone && m.toZone ? " → " : ""}
                            {m.toZone?.name ?? ""}
                          </span>
                        </div>
                        {(m.note || m.reference) && <div className="text-xs text-ink-muted">{[m.reference, m.note].filter(Boolean).join(" · ")}</div>}
                      </div>
                      <div className="shrink-0 text-right text-xs text-ink-subtle">
                        <div className="flex items-center justify-end gap-1">
                          {m.simulated && <SimBadge />}
                          {fmtDateTime(m.createdAt)}
                        </div>
                        <div>{m.user?.name ?? (m.simulated ? "Simulation" : "System")}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <DetailRow label="Barcode">
                <span className="font-mono">{data.barcode ?? "—"}</span>
              </DetailRow>
              <DetailRow label="Unit">{data.unit}</DetailRow>
              <DetailRow label="Unit weight">{data.unitWeightKg} kg</DetailRow>
              <DetailRow label="Unit cost">{fmtCurrency(data.unitCost, true)}</DetailRow>
              <DetailRow label="Stock value">{fmtCurrency(data.unitCost * data.totals.onHand)}</DetailRow>
              <DetailRow label="Reorder level / qty">
                {data.reorderLevel} / {data.reorderQty}
              </DetailRow>
              <DetailRow label="Supplier">{data.supplier?.name ?? "—"}</DetailRow>
              {data.supplier && (
                <>
                  <DetailRow label="Supplier contact">{data.supplier.contactName ?? "—"}</DetailRow>
                  <DetailRow label="Lead time">{data.supplier.leadTimeDays} days</DetailRow>
                </>
              )}
              <DetailRow label="Created">{fmtDate(data.createdAt)}</DetailRow>
              {data.description && <p className="mt-3 rounded-lg bg-surface-muted p-3 text-[13px] text-ink-muted">{data.description}</p>}
            </TabsContent>
          </Tabs>

          {dialog === "adjust" && <AdjustDialog open onOpenChange={() => setDialog(null)} product={data} stock={data.stock} />}
          {dialog === "transfer" && <TransferDialog open onOpenChange={() => setDialog(null)} product={data} stock={data.stock} />}
          {dialog === "damage" && <ZoneDamageDialog open onOpenChange={() => setDialog(null)} product={data} stock={data.stock} />}
          {dialog === "edit" && <ProductFormDialog open onOpenChange={() => setDialog(null)} product={data} />}
          <ConfirmDialog
            open={dialog === "delete"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Delete ${data.sku}?`}
            description={
              <>
                Products with order or movement history are <strong>archived</strong> instead of deleted so records stay intact. Products with
                stock on hand or open orders cannot be removed.
              </>
            }
            confirmLabel="Delete product"
            destructive
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}
