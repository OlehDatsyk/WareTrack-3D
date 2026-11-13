"use client";
import { useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import { useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { useDebounced, usePage, useSort, useUrlParam } from "@/lib/hooks";
import { fmtDateTime, fmtNumber, fmtRelative } from "@/lib/format";
import { ORDER_STATUS, PRIORITY } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { ProgressBar, SortableTH, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { EmptyState, ErrorState, PageHeader, Pagination, StatusBadge, TableSkeleton } from "@/components/common/states";
import { OrderDrawer } from "./order-drawer";
import { OrderFormDialog } from "./order-form";

type Row = {
  id: string;
  number: string;
  status: string;
  priority: string;
  customer: { name: string; city: string | null };
  lines: number;
  units: number;
  pickedPct: number;
  createdAt: string;
  requiredDispatchAt: string;
  overdue: boolean;
  shipment: { trackingNumber: string } | null;
  simulated: boolean;
};
type SortKey = "number" | "createdAt" | "requiredDispatchAt" | "priority" | "status";

const TABS = ["ALL", "PENDING", "PROCESSING", "PICKING", "PACKING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;

export function OrdersPage() {
  const [orderId, setOrderId] = useUrlParam("id");
  const [urlStatus] = useUrlParam("status");
  const [tab, setTab] = useState<string>(urlStatus && TABS.includes(urlStatus as (typeof TABS)[number]) ? urlStatus : "ALL");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, toggleSort] = useSort<SortKey>("createdAt", "desc");
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = useCan("orders:write");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage([q, tab, priority, sort]);

  const list = useApiQuery<{ items: Row[]; total: number; counts: Record<string, number> }>(
    ["orders", "list"],
    "/api/orders",
    { q, status: tab === "ALL" ? undefined : tab, priority, sort: sort.field, dir: sort.dir, page, pageSize: 20 },
    { placeholderData: (p) => p },
  );
  const counts = list.data?.counts ?? {};
  const all = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Orders"
        description="Customer orders from release through picking, packing and dispatch."
        actions={
          canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create order
            </Button>
          )
        }
      />
      <Card>
        <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-line px-3 pt-3" role="tablist" aria-label="Order status">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-[13px] font-medium whitespace-nowrap",
                tab === t ? "border-brand-600 text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t === "ALL" ? "All" : ORDER_STATUS[t]?.label}
              <span className="rounded bg-slate-100 px-1.5 text-[11px] text-ink-muted tabular">{t === "ALL" ? all : (counts[t] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order number or customer…" className="pl-9" aria-label="Search orders" />
          </div>
          <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)} className="w-40" aria-label="Priority">
            <option value="">All priorities</option>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState title="No orders found" icon={<ClipboardList />} description="Adjust the filters or create a new order." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <SortableTH label="Order" field="number" sort={sort} onSort={toggleSort} />
                  <TH>Customer</TH>
                  <SortableTH label="Priority" field="priority" sort={sort} onSort={toggleSort} />
                  <SortableTH label="Status" field="status" sort={sort} onSort={toggleSort} />
                  <TH className="text-right">Lines / units</TH>
                  <TH>Picked</TH>
                  <SortableTH label="Created" field="createdAt" sort={sort} onSort={toggleSort} />
                  <SortableTH label="Dispatch by" field="requiredDispatchAt" sort={sort} onSort={toggleSort} />
                  <TH>Shipment</TH>
                </TR>
              </THead>
              <TBody>
                {list.data!.items.map((o) => (
                  <TR key={o.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => setOrderId(o.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOrderId(o.id)}>
                    <TD>
                      <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                        {o.number}
                        {o.simulated && <SimBadge />}
                      </span>
                    </TD>
                    <TD>
                      <div className="font-medium whitespace-nowrap">{o.customer.name}</div>
                      <div className="text-xs text-ink-muted">{o.customer.city}</div>
                    </TD>
                    <TD>
                      <Badge tone={PRIORITY[o.priority]?.tone}>{PRIORITY[o.priority]?.label}</Badge>
                    </TD>
                    <TD>
                      <StatusBadge map={ORDER_STATUS} value={o.status} />
                    </TD>
                    <TD className="text-right tabular">
                      {o.lines} / {fmtNumber(o.units)}
                    </TD>
                    <TD className="w-28">
                      <ProgressBar value={o.pickedPct} label={`${o.number} picked`} />
                    </TD>
                    <TD className="whitespace-nowrap text-ink-muted">{fmtRelative(o.createdAt)}</TD>
                    <TD className={cn("whitespace-nowrap tabular", o.overdue ? "font-semibold text-danger" : "text-ink-muted")}>
                      {fmtDateTime(o.requiredDispatchAt)}
                      {o.overdue && <span className="block text-[11px]">Overdue</span>}
                    </TD>
                    <TD className="text-ink-muted">{o.shipment?.trackingNumber ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
      <OrderDrawer id={orderId} onClose={() => setOrderId(null)} />
      {createOpen && <OrderFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setOrderId} />}
    </div>
  );
}
