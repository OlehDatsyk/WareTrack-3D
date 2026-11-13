"use client";
import { useState } from "react";
import { AlertTriangle, Download, Package, PackageX, Plus, Search, Warehouse } from "lucide-react";
import { toast } from "sonner";
import type { InventoryRow } from "@/server/services/inventory";
import { useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { downloadFile, useDebounced, usePage, useSort, useUrlParam } from "@/lib/hooks";
import { fmtCompact, fmtCurrency, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { SortableTH, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from "@/components/common/states";
import { ProductDrawer } from "./product-drawer";
import { ProductFormDialog } from "./product-form";

type SortKey = "sku" | "name" | "category" | "onHand" | "available" | "reserved" | "damaged" | "value";
type ListResponse = { items: InventoryRow[]; total: number; summary: { skus: number; units: number; value: number; low: number; out: number; damaged: number } };

const STATUS_BADGE = {
  ok: { label: "In stock", tone: "success" },
  low: { label: "Low stock", tone: "warning" },
  out: { label: "Out of stock", tone: "danger" },
} as const;

export function InventoryPage() {
  const [productId, setProductId] = useUrlParam("product");
  const [urlQ] = useUrlParam("q");
  const [search, setSearch] = useState(urlQ ?? "");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, toggleSort] = useSort<SortKey>("sku");
  const [createOpen, setCreateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const canWrite = useCan("inventory:write");
  const q = useDebounced(search.trim(), 250);
  const [page, setPage] = usePage([q, category, stock, archived, sort]);

  const query = { q, category, stock, includeArchived: archived ? "true" : undefined, sort: sort.field, dir: sort.dir, page, pageSize: 20 };
  const list = useApiQuery<ListResponse>(["inventory", "list"], "/api/products", query, { placeholderData: (p) => p });
  const categories = useApiQuery<{ category: string; count: number }[]>(["inventory", "categories"], "/api/products/categories");
  const s = list.data?.summary;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFile("/api/products/export", { q, category, stock, sort: sort.field, dir: sort.dir }, "inventory.csv");
      toast.success("Inventory exported");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Inventory"
        description="Product catalogue, stock levels by zone and movement history."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} loading={exporting}>
              <Download /> Export CSV
            </Button>
            {canWrite && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Add product
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Active SKUs", value: s ? fmtNumber(s.skus) : "—", icon: Package },
          { label: "Units on hand", value: s ? fmtCompact(s.units) : "—", icon: Warehouse },
          { label: "Stock value", value: s ? fmtCurrency(s.value) : "—", icon: Package },
          { label: "Below reorder level", value: s ? `${s.low + s.out}` : "—", icon: AlertTriangle, warn: !!s && s.low + s.out > 0 },
        ].map((t) => (
          <Card key={t.label} className="flex items-center gap-3 p-4">
            <span className={cn("flex size-10 items-center justify-center rounded-xl", t.warn ? "bg-warning-soft text-amber-600" : "bg-brand-50 text-brand-600")}>
              <t.icon className="size-5" />
            </span>
            <div>
              <div className="text-[12.5px] text-ink-muted">{t.label}</div>
              <div className="text-xl font-semibold tabular">{t.value}</div>
            </div>
          </Card>
        ))}
      </div>

      {s && s.low + s.out > 0 && stock !== "low" && stock !== "out" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 text-[13px] text-amber-800" role="status">
          <AlertTriangle className="size-4" />
          <span>
            <strong>{s.low}</strong> products are below their reorder level and <strong>{s.out}</strong> are out of stock.
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setStock("low")}>
            Show low stock
          </Button>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, name or barcode…" className="pl-9" aria-label="Search inventory" />
          </div>
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-48" aria-label="Category">
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.category} value={c.category}>
                {c.category} ({c.count})
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={stock} onChange={(e) => setStock(e.target.value)} className="w-40" aria-label="Stock status">
            <option value="">All stock levels</option>
            <option value="ok">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </NativeSelect>
          <label className="flex items-center gap-2 px-2 text-[13px] text-ink-muted">
            <input type="checkbox" className="accent-brand-600" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
          </label>
        </div>

        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState
            title="No products match"
            icon={<PackageX />}
            description="Try a different search or clear the filters."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setStock("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <SortableTH label="Product" field="name" sort={sort} onSort={toggleSort} />
                  <SortableTH label="Category" field="category" sort={sort} onSort={toggleSort} />
                  <SortableTH label="On hand" field="onHand" sort={sort} onSort={toggleSort} className="text-right" />
                  <SortableTH label="Reserved" field="reserved" sort={sort} onSort={toggleSort} className="text-right" />
                  <SortableTH label="Available" field="available" sort={sort} onSort={toggleSort} className="text-right" />
                  <SortableTH label="Damaged" field="damaged" sort={sort} onSort={toggleSort} className="text-right" />
                  <TH className="text-right">Reorder lvl</TH>
                  <TH>Status</TH>
                  <TH>Locations</TH>
                  <SortableTH label="Value" field="value" sort={sort} onSort={toggleSort} className="text-right" />
                </TR>
              </THead>
              <TBody>
                {list.data!.items.map((r) => (
                  <TR
                    key={r.id}
                    className={cn("cursor-pointer hover:bg-surface-muted", !r.isActive && "opacity-60")}
                    onClick={() => setProductId(r.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setProductId(r.id)}
                  >
                    <TD className="min-w-[230px]">
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[11.5px] whitespace-nowrap text-ink-muted">
                        {r.sku}
                        {r.barcode ? ` · ${r.barcode}` : ""}
                      </div>
                    </TD>
                    <TD className="text-ink-muted">{r.category}</TD>
                    <TD className="text-right tabular">{fmtNumber(r.onHand)}</TD>
                    <TD className="text-right text-ink-muted tabular">{fmtNumber(r.reserved)}</TD>
                    <TD className={cn("text-right font-semibold tabular", r.status !== "ok" && "text-amber-700", r.status === "out" && "text-danger")}>{fmtNumber(r.available)}</TD>
                    <TD className={cn("text-right tabular", r.damaged > 0 ? "text-danger" : "text-ink-subtle")}>{fmtNumber(r.damaged)}</TD>
                    <TD className="text-right text-ink-muted tabular">{fmtNumber(r.reorderLevel)}</TD>
                    <TD>
                      {r.isActive ? (
                        <Badge tone={STATUS_BADGE[r.status].tone} dot>
                          {STATUS_BADGE[r.status].label}
                        </Badge>
                      ) : (
                        <Badge>Archived</Badge>
                      )}
                    </TD>
                    <TD className="max-w-[200px] truncate text-ink-muted" title={r.zones ?? ""}>
                      {r.zones ?? "—"}
                    </TD>
                    <TD className="text-right tabular">{fmtCurrency(r.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>

      <ProductDrawer id={productId} onClose={() => setProductId(null)} />
      {createOpen && <ProductFormDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}
