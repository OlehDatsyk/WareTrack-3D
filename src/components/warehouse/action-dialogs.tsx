"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { humanize } from "@/lib/format";
import { TASK_TYPE, ZONE_STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/primitives";

const LIVE_KEYS = [["scene"], ["dashboard"], ["inspect"], ["inventory"], ["tasks"], ["fleet"], ["zones"], ["shipments"]] as const;

type FreeLocation = { id: string; code: string; type: string; level: number; zone: { id: string; name: string; code: string } };
type Zone = { id: string; code: string; name: string; status: string; capacity: number; occupied: number };
type VehicleLite = { id: string; code: string; status: string; energyLevel: number; type: string };

// ───────────────────────────── Move pallet ─────────────────────────────

export function MovePalletDialog({
  open,
  onOpenChange,
  pallet,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pallet: { id: string; code: string; grossWeightKg: number; location: { zone: { id: string } } | null };
}) {
  const [zoneId, setZoneId] = useState<string>("");
  const [toLocationId, setTo] = useState("");
  const [mode, setMode] = useState<"task" | "now">("task");
  const [vehicleId, setVehicleId] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const zones = useApiQuery<Zone[]>(["zones"], open ? "/api/zones" : null);
  const free = useApiQuery<FreeLocation[]>(["locations", "free"], open && zoneId ? "/api/locations" : null, { zoneId, minWeightKg: pallet.grossWeightKg });
  const lifts = useApiQuery<{ items: VehicleLite[] }>(["fleet", "lifts"], open ? "/api/vehicles" : null, { group: "lifts", status: "AVAILABLE", pageSize: 50 });
  const move = useApiMutation<void, { mode: string; task: { number: string } | null }>({
    path: `/api/pallets/${pallet.id}/move`,
    body: () => ({ toLocationId, mode, vehicleId: mode === "task" && vehicleId ? vehicleId : null, priority }),
    invalidate: LIVE_KEYS,
    success: (out) => (out.mode === "now" ? `${pallet.code} moved` : `Task ${out.task?.number} created${vehicleId ? " and started" : ""}`),
    onSuccess: () => onOpenChange(false),
  });
  const usable = (zones.data ?? []).filter((z) => z.status !== "MAINTENANCE" && z.status !== "CLOSED");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Move ${pallet.code}`}
        description="Choose a free location. A forklift task animates the move in the 3D view; “Move now” relocates immediately."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => move.mutate()} disabled={!toLocationId} loading={move.isPending}>
              {mode === "task" ? "Create move task" : "Move now"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Destination zone" htmlFor="mv-zone">
            <NativeSelect
              id="mv-zone"
              value={zoneId}
              onChange={(e) => {
                setZoneId(e.target.value);
                setTo("");
              }}
            >
              <option value="">Select a zone…</option>
              {usable.map((z) => (
                <option key={z.id} value={z.id} disabled={z.capacity === 0}>
                  {z.name} — {z.capacity - z.occupied} free
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Location"
            htmlFor="mv-loc"
            hint={zoneId && free.data?.length === 0 ? "No free location in this zone can take this load." : `Pallet weight ${pallet.grossWeightKg} kg`}
          >
            <NativeSelect id="mv-loc" value={toLocationId} onChange={(e) => setTo(e.target.value)} disabled={!zoneId || free.isLoading}>
              <option value="">{free.isLoading ? "Loading…" : "Select a location…"}</option>
              {(free.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.type.toLowerCase()} {l.type !== "FLOOR" ? `level ${l.level + 1}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            {(["task", "now"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${mode === m ? "bg-surface shadow-sm" : "text-ink-muted"}`}
              >
                {m === "task" ? "Forklift task" : "Move now"}
              </button>
            ))}
          </div>
          {mode === "task" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Forklift" htmlFor="mv-veh" hint="Leave empty to queue for the next free forklift">
                <NativeSelect id="mv-veh" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Any available</option>
                  {(lifts.data?.items ?? [])
                    .filter((v) => v.energyLevel >= 15)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.code} · {v.energyLevel}%
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Priority" htmlFor="mv-pri">
                <NativeSelect id="mv-pri" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                    <option key={p} value={p}>
                      {humanize(p)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Damage ─────────────────────────────

export function DamageDialog({ open, onOpenChange, pallet }: { open: boolean; onOpenChange: (o: boolean) => void; pallet: { id: string; code: string; quantity: number } }) {
  const schema = z.object({
    quantity: z.coerce.number<number>().int().min(1, "At least one unit").max(pallet.quantity, `Max ${pallet.quantity}`),
    note: z.string().trim().min(3, "Describe the damage").max(300),
  });
  const [moveToDamagedZone, setMove] = useState(true);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { quantity: pallet.quantity, note: "" } });
  const save = useApiMutation<z.infer<typeof schema>, { movedTo: string | null }>({
    path: `/api/pallets/${pallet.id}/damage`,
    body: (v) => ({ ...v, moveToDamagedZone }),
    invalidate: LIVE_KEYS,
    success: (o) => `Damage recorded${o.movedTo ? ` — moved to ${o.movedTo}` : ""}`,
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Record damage on ${pallet.code}`}
        description="Damaged units are removed from available stock and tracked separately."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={save.isPending} onClick={form.handleSubmit((v) => save.mutate(v))}>
              Record damage
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <Field label="Damaged units" htmlFor="dm-q" error={e.quantity?.message} hint={`Pallet holds ${pallet.quantity} units`}>
            <Input id="dm-q" type="number" min={1} max={pallet.quantity} aria-invalid={!!e.quantity} {...form.register("quantity")} />
          </Field>
          <Field label="What happened?" htmlFor="dm-n" error={e.note?.message}>
            <Textarea id="dm-n" placeholder="e.g. Crushed cartons after forklift contact" aria-invalid={!!e.note} {...form.register("note")} />
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-[13px]">
            <span>
              <span className="block font-medium">Move to Damaged Goods zone</span>
              <span className="text-xs text-ink-muted">Uses the first free floor slot in the damaged-goods area.</span>
            </span>
            <Switch checked={moveToDamagedZone} onCheckedChange={setMove} aria-label="Move to damaged goods zone" />
          </label>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Assign task to forklift ─────────────────────────────

type TaskLite = { id: string; number: string; type: string; description: string; priority: string; pallet: { code: string } | null };

export function AssignTaskDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle: { id: string; code: string } }) {
  const [taskId, setTaskId] = useState("");
  const tasks = useApiQuery<{ items: TaskLite[] }>(["tasks", "pending"], open ? "/api/tasks" : null, { status: "PENDING", pageSize: 50 });
  const assignable = useMemo(() => (tasks.data?.items ?? []).filter((t) => ["PUTAWAY", "TRANSFER", "REPLENISH", "LOAD", "UNLOAD"].includes(t.type)), [tasks.data]);
  const assign = useApiMutation<void>({
    path: `/api/vehicles/${vehicle.id}/assign`,
    body: () => ({ taskId }),
    invalidate: LIVE_KEYS,
    success: `Task assigned to ${vehicle.code}`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Assign a task to ${vehicle.code}`}
        description="Pending pallet-handling tasks. The forklift starts immediately."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => assign.mutate()} disabled={!taskId} loading={assign.isPending}>
              Assign & start
            </Button>
          </>
        }
      >
        {tasks.isLoading ? (
          <p className="text-sm text-ink-muted">Loading tasks…</p>
        ) : assignable.length === 0 ? (
          <p className="text-sm text-ink-muted">There are no pending forklift tasks right now. Create one by moving a pallet.</p>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Pending tasks">
            {assignable.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-[13px] ${taskId === t.id ? "border-brand-400 bg-brand-50" : "border-line hover:bg-surface-muted"}`}
              >
                <input type="radio" name="task" className="mt-1 accent-brand-600" checked={taskId === t.id} onChange={() => setTaskId(t.id)} />
                <span>
                  <span className="font-semibold">{t.number}</span> <span className="text-ink-muted">· {TASK_TYPE[t.type]} · {humanize(t.priority)}</span>
                  <span className="block text-xs text-ink-muted">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Assign shipment to dock ─────────────────────────────

type ShipmentLite = { id: string; trackingNumber: string; status: string; direction: string; carrier: string; destination: string; origin: string };

export function AssignShipmentDialog({
  open,
  onOpenChange,
  dock,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dock: { id: string; name: string; direction: string; upcoming: ShipmentLite[] };
}) {
  const [shipmentId, setShipmentId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const trucks = useApiQuery<{ items: (VehicleLite & { onSite: boolean })[] }>(["fleet", "trucks"], open && dock.direction === "OUTBOUND" ? "/api/vehicles" : null, {
    group: "road",
    status: "AVAILABLE",
    pageSize: 50,
  });
  const assign = useApiMutation<void>({
    path: `/api/shipments/${shipmentId}/dock`,
    body: () => ({ dockId: dock.id, vehicleId: vehicleId || null }),
    invalidate: LIVE_KEYS,
    success: `Shipment assigned to ${dock.name}`,
    onSuccess: () => onOpenChange(false),
  });
  const outbound = dock.direction === "OUTBOUND";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Assign shipment to ${dock.name}`}
        description={outbound ? "Planned outbound shipments. Pick the truck that will load here." : "Inbound shipments en route or planned."}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => assign.mutate()} disabled={!shipmentId || (outbound && !vehicleId)} loading={assign.isPending}>
              Assign to dock
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Shipment" htmlFor="as-s">
            <NativeSelect id="as-s" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
              <option value="">{dock.upcoming.length ? "Select a shipment…" : "No eligible shipments"}</option>
              {dock.upcoming.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.trackingNumber} · {outbound ? `to ${s.destination}` : `from ${s.origin}`} · {humanize(s.status)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {outbound && (
            <Field label="Truck" htmlFor="as-v">
              <NativeSelect id="as-v" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Select a truck…</option>
                {(trucks.data?.items ?? [])
                  .filter((t) => t.onSite)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.type === "VAN" ? "van" : "truck"} · fuel {t.energyLevel}%
                    </option>
                  ))}
              </NativeSelect>
            </Field>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Zone status ─────────────────────────────

export function ZoneStatusDialog({ open, onOpenChange, zone }: { open: boolean; onOpenChange: (o: boolean) => void; zone: { id: string; name: string; status: string } }) {
  const [status, setStatus] = useState(zone.status);
  const [reason, setReason] = useState("");
  const save = useApiMutation<void>({
    path: `/api/zones/${zone.id}`,
    method: "PATCH",
    body: () => ({ status, statusReason: reason || undefined }),
    invalidate: LIVE_KEYS,
    success: `${zone.name} updated`,
    onSuccess: () => onOpenChange(false),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Change status — ${zone.name}`}
        description="Zones in maintenance or closed cannot receive stock; open tasks into them will be cancelled."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={status === zone.status} loading={save.isPending}>
              Save status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ZONE_STATUS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                className={`rounded-lg border px-3 py-2 text-left text-[13px] font-medium ${status === k ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line hover:bg-surface-muted"}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Field label="Reason (optional)" htmlFor="zs-r">
            <Input id="zs-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sprinkler inspection until 14:00" maxLength={200} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
