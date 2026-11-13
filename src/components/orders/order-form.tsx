"use client";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { orderSchema } from "@/schemas/orders";
import { useApiMutation, useApiQuery } from "@/lib/query";
import type { InventoryRow } from "@/server/services/inventory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";

type Values = z.input<typeof orderSchema>;

function defaultDispatch() {
  const d = new Date(Date.now() + 24 * 3_600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
}

export function OrderFormDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const customers = useApiQuery<{ id: string; name: string; city: string | null }[]>(["customers"], open ? "/api/customers" : null);
  const products = useApiQuery<{ items: InventoryRow[] }>(["inventory", "orderable"], open ? "/api/products" : null, { pageSize: 200, sort: "name" });
  const form = useForm<Values>({
    resolver: zodResolver(orderSchema),
    defaultValues: { customerId: "", priority: "NORMAL", requiredDispatchAt: defaultDispatch() as unknown as Date, notes: "", items: [{ productId: "", quantity: 1 }] },
  });
  const items = useFieldArray({ control: form.control, name: "items" });
  const create = useApiMutation<Values, { id: string; number: string }>({
    path: "/api/orders",
    invalidate: [["orders"], ["dashboard"]],
    success: (o) => `Order ${o.number} created`,
    onSuccess: (o) => {
      onOpenChange(false);
      onCreated?.(o.id);
    },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => create.mutate(v));
  const productList = products.data?.items ?? [];
  const watched = form.watch("items");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Create order"
        description="New orders start as pending. Stock is reserved when the order is released for processing."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              Create order
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Customer" htmlFor="o-c" error={e.customerId?.message} className="sm:col-span-3">
              <NativeSelect id="o-c" aria-invalid={!!e.customerId} {...form.register("customerId")}>
                <option value="">Select a customer…</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.city ? `— ${c.city}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="o-p">
              <NativeSelect id="o-p" {...form.register("priority")}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </NativeSelect>
            </Field>
            <Field label="Required dispatch" htmlFor="o-d" error={e.requiredDispatchAt?.message} className="sm:col-span-2">
              <Input id="o-d" type="datetime-local" aria-invalid={!!e.requiredDispatchAt} {...form.register("requiredDispatchAt")} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-medium">Order lines</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => items.append({ productId: "", quantity: 1 })} disabled={items.fields.length >= 50}>
                <Plus /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {items.fields.map((f, idx) => {
                const product = productList.find((p) => p.id === watched?.[idx]?.productId);
                const qty = Number(watched?.[idx]?.quantity ?? 0);
                return (
                  <div key={f.id} className="flex items-start gap-2">
                    <div className="flex-1">
                      <NativeSelect aria-label={`Product line ${idx + 1}`} aria-invalid={!!e.items?.[idx]?.productId} {...form.register(`items.${idx}.productId`)}>
                        <option value="">Select a product…</option>
                        {productList.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.available <= 0}>
                            {p.name} ({p.sku}) — {p.available} available
                          </option>
                        ))}
                      </NativeSelect>
                      {product && qty > product.available && <p className="mt-1 text-xs text-amber-700">Only {product.available} available — the order can be created but not released until stock arrives.</p>}
                      {e.items?.[idx]?.productId && <p className="mt-1 text-xs text-danger">{e.items[idx]?.productId?.message}</p>}
                    </div>
                    <Input type="number" min={1} className="w-24" aria-label={`Quantity line ${idx + 1}`} aria-invalid={!!e.items?.[idx]?.quantity} {...form.register(`items.${idx}.quantity`)} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => items.remove(idx)} disabled={items.fields.length === 1} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
            </div>
            {e.items?.message && <p className="mt-1 text-xs text-danger">{e.items.message}</p>}
            {e.items?.root?.message && <p className="mt-1 text-xs text-danger">{e.items.root.message}</p>}
          </div>

          <Field label="Notes" htmlFor="o-n">
            <Textarea id="o-n" rows={2} placeholder="Delivery instructions, references…" {...form.register("notes")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
