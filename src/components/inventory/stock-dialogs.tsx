"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { adjustSchema, transferSchema, zoneDamageSchema } from "@/schemas/inventory";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";

type ZoneOpt = { id: string; name: string; type: string; status: string };
type StockRow = { zone: { id: string; name: string }; quantity: number; reserved: number };
const INVALIDATE = [["inventory"], ["inspect"], ["dashboard"], ["zones"], ["scene"]] as const;
const STOCK_ZONES = (z: ZoneOpt) => z.type !== "DISPATCH" && z.type !== "PACKING";

function useZones(open: boolean) {
  return useApiQuery<ZoneOpt[]>(["zones"], open ? "/api/zones" : null);
}

type DialogProps = { open: boolean; onOpenChange: (o: boolean) => void; product: { id: string; sku: string; name: string }; stock: StockRow[] };

export function AdjustDialog({ open, onOpenChange, product, stock }: DialogProps) {
  const zones = useZones(open);
  const form = useForm<z.input<typeof adjustSchema>>({ resolver: zodResolver(adjustSchema), defaultValues: { zoneId: stock[0]?.zone.id ?? "", delta: 0, reason: "" } });
  const zoneId = form.watch("zoneId");
  const current = stock.find((s) => s.zone.id === zoneId);
  const save = useApiMutation<z.input<typeof adjustSchema>>({
    path: `/api/products/${product.id}/adjust`,
    invalidate: INVALIDATE,
    success: "Stock adjusted",
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Adjust stock — ${product.sku}`}
        description="Record a cycle-count correction. Use negative numbers to reduce stock."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Apply adjustment
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Zone" htmlFor="adj-z" error={e.zoneId?.message} hint={current ? `Currently ${current.quantity} on hand, ${current.reserved} reserved` : "No stock recorded in this zone yet"}>
            <NativeSelect id="adj-z" {...form.register("zoneId")}>
              <option value="">Select a zone…</option>
              {(zones.data ?? []).filter(STOCK_ZONES).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Adjustment (units)" htmlFor="adj-d" error={e.delta?.message}>
            <Input id="adj-d" type="number" aria-invalid={!!e.delta} {...form.register("delta")} />
          </Field>
          <Field label="Reason" htmlFor="adj-r" error={e.reason?.message}>
            <Input id="adj-r" placeholder="e.g. Cycle count variance in bay A03-07" aria-invalid={!!e.reason} {...form.register("reason")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TransferDialog({ open, onOpenChange, product, stock }: DialogProps) {
  const zones = useZones(open);
  const form = useForm<z.input<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromZoneId: stock.find((s) => s.quantity - s.reserved > 0)?.zone.id ?? "", toZoneId: "", quantity: 1, note: "" },
  });
  const from = stock.find((s) => s.zone.id === form.watch("fromZoneId"));
  const save = useApiMutation<z.input<typeof transferSchema>>({
    path: `/api/products/${product.id}/transfer`,
    invalidate: INVALIDATE,
    success: "Stock transferred",
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Transfer stock — ${product.sku}`}
        description="Move loose units between zones. To move a whole pallet, use the 3D view."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Transfer
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submit} noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From zone" htmlFor="tr-f" error={e.fromZoneId?.message} hint={from ? `${from.quantity - from.reserved} unreserved` : undefined}>
              <NativeSelect id="tr-f" {...form.register("fromZoneId")}>
                <option value="">Select…</option>
                {stock
                  .filter((s) => s.quantity > 0)
                  .map((s) => (
                    <option key={s.zone.id} value={s.zone.id}>
                      {s.zone.name} ({s.quantity})
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="To zone" htmlFor="tr-t" error={e.toZoneId?.message}>
              <NativeSelect id="tr-t" {...form.register("toZoneId")}>
                <option value="">Select…</option>
                {(zones.data ?? [])
                  .filter(STOCK_ZONES)
                  .filter((z) => z.status !== "MAINTENANCE" && z.status !== "CLOSED")
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Quantity" htmlFor="tr-q" error={e.quantity?.message}>
            <Input id="tr-q" type="number" min={1} aria-invalid={!!e.quantity} {...form.register("quantity")} />
          </Field>
          <Field label="Note (optional)" htmlFor="tr-n">
            <Input id="tr-n" {...form.register("note")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ZoneDamageDialog({ open, onOpenChange, product, stock }: DialogProps) {
  const form = useForm<z.input<typeof zoneDamageSchema>>({
    resolver: zodResolver(zoneDamageSchema),
    defaultValues: { zoneId: stock.find((s) => s.quantity > 0)?.zone.id ?? "", quantity: 1, note: "" },
  });
  const save = useApiMutation<z.input<typeof zoneDamageSchema>>({
    path: `/api/products/${product.id}/damage`,
    invalidate: INVALIDATE,
    success: "Damaged goods recorded",
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Record damaged goods — ${product.sku}`}
        description="Damaged units are removed from available stock and tracked separately."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submit} loading={save.isPending}>
              Record damage
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submit} noValidate>
          <Field label="Zone" htmlFor="zd-z" error={e.zoneId?.message}>
            <NativeSelect id="zd-z" {...form.register("zoneId")}>
              <option value="">Select…</option>
              {stock
                .filter((s) => s.quantity > 0)
                .map((s) => (
                  <option key={s.zone.id} value={s.zone.id}>
                    {s.zone.name} ({s.quantity - s.reserved} unreserved)
                  </option>
                ))}
            </NativeSelect>
          </Field>
          <Field label="Damaged units" htmlFor="zd-q" error={e.quantity?.message}>
            <Input id="zd-q" type="number" min={1} aria-invalid={!!e.quantity} {...form.register("quantity")} />
          </Field>
          <Field label="What happened?" htmlFor="zd-n" error={e.note?.message}>
            <Textarea id="zd-n" rows={2} aria-invalid={!!e.note} {...form.register("note")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
