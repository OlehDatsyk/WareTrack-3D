"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Boxes, LayoutGrid, Pencil, Plus, Thermometer, Trash2 } from "lucide-react";
import { zoneSchema } from "@/schemas/operations";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { useUrlParam } from "@/lib/hooks";
import { fmtNumber } from "@/lib/format";
import { EMPLOYEE_ROLE, TASK_TYPE, ZONE_STATUS, ZONE_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { ProgressBar, Skeleton, Switch } from "@/components/ui/primitives";
import { DetailRow, EmptyState, ErrorState, PageHeader, SectionTitle, StatusBadge } from "@/components/common/states";
import { ZoneStatusDialog } from "@/components/warehouse/action-dialogs";

type Zone = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  color: string;
  temperatureC: number | null;
  notes: string | null;
  indoor: boolean;
  x: number;
  z: number;
  width: number;
  depth: number;
  capacity: number;
  occupied: number;
  blocked: number;
  units: number;
  damagedUnits: number;
  openOperations: number;
  staff: number;
  racks: number;
};
type ZoneDetail = Zone & {
  topProducts: { id: string; quantity: number; damaged: number; product: { id: string; name: string; sku: string } }[];
  staff: { id: string; firstName: string; lastName: string; role: string; status: string }[];
  tasks: { id: string; number: string; type: string; status: string; description: string }[];
};

const INVALIDATE = [["zones"], ["scene"], ["inspect"], ["dashboard"]] as const;

function FloorPlan({ zones, selected, onSelect, building }: { zones: Zone[]; selected: string | null; onSelect: (id: string) => void; building: { w: number; d: number } }) {
  const all = zones.map((z) => [z.x - z.width / 2, z.z - z.depth / 2, z.x + z.width / 2, z.z + z.depth / 2]);
  const minX = Math.min(-building.w / 2, ...all.map((a) => a[0]!)) - 3;
  const minZ = Math.min(-building.d / 2, ...all.map((a) => a[1]!)) - 3;
  const maxX = Math.max(building.w / 2, ...all.map((a) => a[2]!)) + 3;
  const maxZ = Math.max(building.d / 2, ...all.map((a) => a[3]!)) + 3;
  return (
    <svg viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`} className="h-full w-full" role="img" aria-label="Warehouse floor plan">
      <rect x={-building.w / 2} y={-building.d / 2} width={building.w} height={building.d} fill="#f1f5f9" stroke="#2563eb" strokeWidth={0.5} rx={0.6} />
      {zones.map((z) => {
        const pct = z.capacity ? z.occupied / z.capacity : 0;
        const blocked = z.status === "MAINTENANCE" || z.status === "CLOSED";
        const sel = selected === z.id;
        return (
          <g key={z.id} className="cursor-pointer" onClick={() => onSelect(z.id)}>
            <rect
              x={z.x - z.width / 2}
              y={z.z - z.depth / 2}
              width={z.width}
              height={z.depth}
              fill={z.color}
              fillOpacity={0.12 + pct * 0.35}
              stroke={blocked ? "#dc2626" : z.color}
              strokeWidth={sel ? 0.8 : 0.35}
              strokeDasharray={z.indoor ? undefined : "1.2 0.8"}
              rx={0.4}
            />
            <text x={z.x - z.width / 2 + 0.8} y={z.z - z.depth / 2 + 2.4} fontSize={Math.min(2.2, z.width / 6)} fontWeight={600} fill="#172033">
              {z.name}
            </text>
            <text x={z.x - z.width / 2 + 0.8} y={z.z - z.depth / 2 + 4.6} fontSize={1.7} fill="#475569">
              {Math.round(pct * 100)}% · {z.occupied}/{z.capacity}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ZoneForm({ zone, onClose }: { zone?: Zone; onClose: () => void }) {
  const form = useForm<z.input<typeof zoneSchema>>({
    resolver: zodResolver(zoneSchema),
    defaultValues: zone
      ? { ...zone, type: zone.type as "STORAGE", status: zone.status as "ACTIVE", temperatureC: zone.temperatureC ?? ("" as unknown as number), notes: zone.notes ?? "", floorSlots: 0 }
      : { code: "", name: "", type: "STORAGE", status: "ACTIVE", color: "#2563EB", temperatureC: "" as unknown as number, notes: "", x: 0, z: -34, width: 12, depth: 8, indoor: false, floorSlots: 8 },
  });
  const save = useApiMutation<z.input<typeof zoneSchema>, { name: string }>({
    method: zone ? "PATCH" : "POST",
    path: zone ? `/api/zones/${zone.id}` : "/api/zones",
    body: (v) => {
      const { floorSlots, ...rest } = v;
      const out = { ...rest, temperatureC: v.temperatureC === "" || v.temperatureC == null ? null : v.temperatureC, notes: v.notes || null };
      return zone ? out : { ...out, floorSlots };
    },
    invalidate: INVALIDATE,
    success: (z) => (zone ? `${z.name} updated` : `${z.name} created`),
    onSuccess: onClose,
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={zone ? `Edit ${zone.name}` : "Create zone"}
        description="Position and size are in metres from the centre of the main building; the zone appears in the 3D view."
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {zone ? "Save" : "Create zone"}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-2 gap-4" onSubmit={submit} noValidate>
          <Field label="Code" htmlFor="z-code" error={e.code?.message}>
            <Input id="z-code" aria-invalid={!!e.code} {...form.register("code")} onChange={(ev) => form.setValue("code", ev.target.value.toUpperCase())} />
          </Field>
          <Field label="Name" htmlFor="z-name" error={e.name?.message}>
            <Input id="z-name" aria-invalid={!!e.name} {...form.register("name")} />
          </Field>
          <Field label="Type" htmlFor="z-type">
            <NativeSelect id="z-type" {...form.register("type")}>
              {Object.entries(ZONE_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Colour" htmlFor="z-color" error={e.color?.message}>
            <Input id="z-color" type="color" className="h-9 p-1" {...form.register("color")} />
          </Field>
          <Field label="Centre X (m)" htmlFor="z-x" error={e.x?.message}>
            <Input id="z-x" type="number" step="0.5" {...form.register("x")} />
          </Field>
          <Field label="Centre Z (m)" htmlFor="z-z" error={e.z?.message}>
            <Input id="z-z" type="number" step="0.5" {...form.register("z")} />
          </Field>
          <Field label="Width (m)" htmlFor="z-w" error={e.width?.message}>
            <Input id="z-w" type="number" step="0.5" {...form.register("width")} />
          </Field>
          <Field label="Depth (m)" htmlFor="z-d" error={e.depth?.message}>
            <Input id="z-d" type="number" step="0.5" {...form.register("depth")} />
          </Field>
          <Field label="Temperature (°C, optional)" htmlFor="z-t" error={e.temperatureC?.message}>
            <Input id="z-t" type="number" step="0.5" {...form.register("temperatureC")} />
          </Field>
          {!zone && (
            <Field label="Floor slots to create" htmlFor="z-fs" error={e.floorSlots?.message} hint="Pallet positions on the floor">
              <Input id="z-fs" type="number" min={0} max={60} {...form.register("floorSlots")} />
            </Field>
          )}
          <label className="col-span-2 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[13px]">
            Indoor zone
            <Switch checked={!!form.watch("indoor")} onCheckedChange={(v) => form.setValue("indoor", v)} aria-label="Indoor zone" />
          </label>
          <Field label="Notes" htmlFor="z-n" className="col-span-2">
            <Textarea id="z-n" rows={2} {...form.register("notes")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ZoneDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<ZoneDetail>(["zones", "detail", id], id ? `/api/zones/${id}` : null);
  const canWrite = useCan("zones:write");
  const [dialog, setDialog] = useState<null | "status" | "edit" | "delete">(null);
  const del = useApiMutation<void>({
    method: "DELETE",
    path: `/api/zones/${id}`,
    invalidate: INVALIDATE,
    success: "Zone deleted",
    onSuccess: () => {
      setDialog(null);
      onClose();
    },
  });
  const pct = data && data.capacity ? (data.occupied / data.capacity) * 100 : 0;
  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={data?.name ?? "Zone"}
      description={
        data && (
          <span className="flex items-center gap-2">
            {ZONE_TYPE[data.type]} · {data.code}
            <StatusBadge map={ZONE_STATUS} value={data.status} />
          </span>
        )
      }
      footer={
        data && (
          <>
            {canWrite && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("delete")}>
                <Trash2 /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/warehouse?select=zone:${data.id}`}>
                <Boxes /> Show in 3D
              </Link>
            </Button>
            {canWrite && (
              <>
                <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                  <Pencil /> Edit
                </Button>
                <Button size="sm" onClick={() => setDialog("status")}>
                  Change status
                </Button>
              </>
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
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="text-ink-muted">Occupancy</span>
            <span className="font-semibold tabular">
              {data.occupied}/{data.capacity} positions · {pct.toFixed(0)}%
            </span>
          </div>
          <ProgressBar value={pct} tone="auto" label="Zone occupancy" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["Units", fmtNumber(data.units)],
              ["Open operations", data.openOperations],
              ["Racks", data.racks],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <div className="text-[11.5px] text-ink-muted">{k}</div>
                <div className="text-lg font-semibold tabular">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            {data.temperatureC != null && <DetailRow label="Temperature">{data.temperatureC} °C</DetailRow>}
            {data.damagedUnits > 0 && <DetailRow label="Damaged units">{fmtNumber(data.damagedUnits)}</DetailRow>}
            {data.blocked > 0 && <DetailRow label="Blocked positions">{data.blocked}</DetailRow>}
            <DetailRow label="Footprint">
              {data.width} × {data.depth} m {data.indoor ? "indoor" : "outdoor"}
            </DetailRow>
          </div>
          {data.notes && <p className="mt-2 rounded-lg bg-surface-muted p-3 text-[13px] text-ink-muted">{data.notes}</p>}
          <SectionTitle>Assigned operations</SectionTitle>
          {data.tasks.length === 0 ? (
            <p className="text-xs text-ink-muted">No open tasks in this zone.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.tasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-line px-3 py-2 text-[13px]">
                  <span className="font-semibold">{t.number}</span> <span className="text-ink-muted">· {TASK_TYPE[t.type]}</span>
                  <div className="truncate text-xs text-ink-muted">{t.description}</div>
                </li>
              ))}
            </ul>
          )}
          <SectionTitle>Staff</SectionTitle>
          {data.staff.length === 0 ? (
            <p className="text-xs text-ink-muted">No staff based in this zone.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.staff.map((s) => (
                <Link key={s.id} href={`/workforce?id=${s.id}`} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-surface-muted">
                  {s.firstName} {s.lastName} <span className="text-ink-muted">· {EMPLOYEE_ROLE[s.role]}</span>
                </Link>
              ))}
            </div>
          )}
          <SectionTitle>Top stock</SectionTitle>
          {data.topProducts.length === 0 ? (
            <p className="text-xs text-ink-muted">Empty.</p>
          ) : (
            <ul className="space-y-1">
              {data.topProducts.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 text-[13px]">
                  <Link href={`/inventory?product=${p.product.id}`} className="truncate hover:text-brand-600">
                    {p.product.name}
                  </Link>
                  <span className="text-ink-muted tabular">{fmtNumber(p.quantity || p.damaged)}</span>
                </li>
              ))}
            </ul>
          )}
          {dialog === "status" && <ZoneStatusDialog open onOpenChange={() => setDialog(null)} zone={data} />}
          {dialog === "edit" && <ZoneForm zone={data} onClose={() => setDialog(null)} />}
          <ConfirmDialog
            open={dialog === "delete"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Delete ${data.name}?`}
            description="The zone and its storage positions are removed permanently. Zones that still hold stock cannot be deleted."
            confirmLabel="Delete zone"
            destructive
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}

export function ZonesPage() {
  const [id, setId] = useUrlParam("id");
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = useCan("zones:write");
  const zones = useApiQuery<Zone[]>(["zones"], "/api/zones", undefined, { refetchInterval: 15_000 });
  const scene = useApiQuery<{ warehouse: { buildingWidth: number; buildingDepth: number } }>(["scene"], "/api/scene");
  const building = { w: scene.data?.warehouse.buildingWidth ?? 80, d: scene.data?.warehouse.buildingDepth ?? 44 };
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Warehouse zones"
        description="Organise the site into functional areas with capacity, status and operations."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create zone
            </Button>
          )
        }
      />
      {zones.isError ? (
        <Card>
          <ErrorState message={zones.error.message} onRetry={() => zones.refetch()} />
        </Card>
      ) : !zones.data ? (
        <Skeleton className="h-96 rounded-[var(--radius-card)]" />
      ) : zones.data.length === 0 ? (
        <Card>
          <EmptyState title="No zones yet" icon={<LayoutGrid />} />
        </Card>
      ) : (
        <>
          <Card className="mb-5">
            <CardHeader title="Floor plan" description="Shading shows occupancy; dashed outlines are outdoor zones. Click a zone for details." />
            <div className="h-[340px] px-5 pb-5">
              <FloorPlan zones={zones.data} selected={id} onSelect={setId} building={building} />
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {zones.data.map((z) => {
              const pct = z.capacity ? (z.occupied / z.capacity) * 100 : 0;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setId(z.id)}
                  className={cn("rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card transition-colors hover:border-line-strong", id === z.id ? "border-brand-400 ring-2 ring-brand-100" : "border-line")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="size-3 rounded" style={{ background: z.color }} />
                      <div>
                        <div className="text-[15px] font-semibold">{z.name}</div>
                        <div className="text-xs text-ink-muted">
                          {ZONE_TYPE[z.type]} · {z.code}
                        </div>
                      </div>
                    </div>
                    <StatusBadge map={ZONE_STATUS} value={z.status} />
                  </div>
                  <div className="mt-4 mb-1 flex justify-between text-xs">
                    <span className="text-ink-muted">Occupancy</span>
                    <span className="font-semibold tabular">
                      {z.occupied}/{z.capacity} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <ProgressBar value={pct} tone="auto" label={`${z.name} occupancy`} />
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <span>{fmtNumber(z.units)} units</span>
                    <span>{z.openOperations} open ops</span>
                    <span>{z.staff} staff</span>
                    {z.temperatureC != null && (
                      <span className="flex items-center gap-0.5">
                        <Thermometer className="size-3" />
                        {z.temperatureC} °C
                      </span>
                    )}
                    {!z.indoor && <Badge tone="neutral">Outdoor</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <ZoneDrawer id={id} onClose={() => setId(null)} />
      {createOpen && <ZoneForm onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
