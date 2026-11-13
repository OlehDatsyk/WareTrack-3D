"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { productSchema } from "@/schemas/inventory";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";

type FormValues = z.input<typeof productSchema>;
type Product = {
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
};

export function ProductFormDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product }) {
  const suppliers = useApiQuery<{ id: string; name: string }[]>(["suppliers"], open ? "/api/suppliers" : null);
  const categories = useApiQuery<{ category: string }[]>(["inventory", "categories"], open ? "/api/products/categories" : null);
  const form = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? { ...product, barcode: product.barcode ?? "", description: product.description ?? "", supplierId: product.supplierId ?? "" }
      : { sku: "", barcode: "", name: "", description: "", category: "", unit: "ea", unitWeightKg: 1, unitCost: 0, reorderLevel: 50, reorderQty: 200, supplierId: "" },
  });
  const save = useApiMutation<FormValues, { id: string; sku: string }>({
    method: product ? "PATCH" : "POST",
    path: product ? `/api/products/${product.id}` : "/api/products",
    invalidate: [["inventory"], ["inspect"]],
    success: (p) => (product ? `${p.sku} updated` : `${p.sku} added to the catalogue`),
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={product ? `Edit ${product.sku}` : "Add product"}
        description="Product master data is shared across all warehouses."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {product ? "Save changes" : "Add product"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="SKU" htmlFor="p-sku" error={e.sku?.message}>
            <Input id="p-sku" placeholder="PPE-HLM-Y" aria-invalid={!!e.sku} {...form.register("sku")} onChange={(ev) => form.setValue("sku", ev.target.value.toUpperCase(), { shouldValidate: form.formState.isSubmitted })} />
          </Field>
          <Field label="Barcode (EAN/UPC)" htmlFor="p-bc" error={e.barcode?.message}>
            <Input id="p-bc" inputMode="numeric" aria-invalid={!!e.barcode} {...form.register("barcode")} />
          </Field>
          <Field label="Product name" htmlFor="p-name" error={e.name?.message} className="sm:col-span-2">
            <Input id="p-name" aria-invalid={!!e.name} {...form.register("name")} />
          </Field>
          <Field label="Category" htmlFor="p-cat" error={e.category?.message}>
            <Input id="p-cat" list="p-cat-list" aria-invalid={!!e.category} {...form.register("category")} />
            <datalist id="p-cat-list">
              {(categories.data ?? []).map((c) => (
                <option key={c.category} value={c.category} />
              ))}
            </datalist>
          </Field>
          <Field label="Supplier" htmlFor="p-sup">
            <NativeSelect id="p-sup" {...form.register("supplierId")}>
              <option value="">No supplier</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Unit of measure" htmlFor="p-unit" error={e.unit?.message}>
            <Input id="p-unit" {...form.register("unit")} />
          </Field>
          <Field label="Unit weight (kg)" htmlFor="p-w" error={e.unitWeightKg?.message}>
            <Input id="p-w" type="number" step="0.01" min={0} aria-invalid={!!e.unitWeightKg} {...form.register("unitWeightKg")} />
          </Field>
          <Field label="Unit cost (USD)" htmlFor="p-c" error={e.unitCost?.message}>
            <Input id="p-c" type="number" step="0.01" min={0} aria-invalid={!!e.unitCost} {...form.register("unitCost")} />
          </Field>
          <Field label="Reorder level" htmlFor="p-rl" error={e.reorderLevel?.message} hint="Alert when available stock falls below this">
            <Input id="p-rl" type="number" min={0} aria-invalid={!!e.reorderLevel} {...form.register("reorderLevel")} />
          </Field>
          <Field label="Reorder quantity" htmlFor="p-rq" error={e.reorderQty?.message}>
            <Input id="p-rq" type="number" min={0} aria-invalid={!!e.reorderQty} {...form.register("reorderQty")} />
          </Field>
          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" rows={2} {...form.register("description")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
