"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { shipmentSchema } from "@/schemas/shipments";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";

const INVALIDATE = [["shipments"], ["dashboard"], ["orders"], ["scene"], ["fleet"]] as const;
const CARRIERS = ["WareTrack Freight", "Bluepeak Logistics", "Northline Carriers", "Meridian Express", "Harborline Haulage"];

type VehicleLite = { id: string; code: string; type: string; status: string; onSite: boolean };
type EmployeeLite = { id: string; firstName: string; lastName: string; status: string };

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function useDriversAndTrucks(enabled: boolean) {
  const trucks = useApiQuery<{ items: VehicleLite[] }>(["fleet", "road"], enabled ? "/api/vehicles" : null, { group: "road", pageSize: 100 });
  const drivers = useApiQuery<{ items: EmployeeLite[] }>(["workforce", "drivers"], enabled ? "/api/employees" : null, { role: "DRIVER", pageSize: 100 });
  return { trucks: trucks.data?.items ?? [], drivers: drivers.data?.items ?? [] };
}

export function CreateShipmentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const { trucks, drivers } = useDriversAndTrucks(open);
  const customers = useApiQuery<{ id: string; name: string; city: string | null }[]>(["customers"], open ? "/api/customers" : null);
  const ready = useApiQuery<{ items: { id: string; number: string; customer: { name: string; city: string | null } }[] }>(["orders", "ready"], open ? "/api/orders" : null, {
    status: "READY_FOR_DISPATCH",
    pageSize: 50,
  });
  const now = new Date();
  const form = useForm<z.input<typeof shipmentSchema>>({
    resolver: zodResolver(shipmentSchema),
    defaultValues: {
      direction: "OUTBOUND",
      carrier: CARRIERS[0],
      counterpart: "",
      scheduledAt: localInput(new Date(now.getTime() + 3_600_000)) as unknown as Date,
      eta: localInput(new Date(now.getTime() + 5 * 3_600_000)) as unknown as Date,
      palletCount: 0,
      weightKg: 0,
      vehicleId: "",
      driverId: "",
      orderIds: [],
    },
  });
  const direction = form.watch("direction");
  const orderIds = form.watch("orderIds") ?? [];
  const create = useApiMutation<z.input<typeof shipmentSchema>, { id: string; trackingNumber: string }>({
    path: "/api/shipments",
    body: (v) => ({ ...v, vehicleId: v.vehicleId || null, driverId: v.driverId || null }),
    invalidate: INVALIDATE,
    success: (s) => `Shipment ${s.trackingNumber} planned`,
    onSuccess: (s) => {
      onOpenChange(false);
      onCreated?.(s.id);
    },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => create.mutate(v));
  const cities = Array.from(new Set((customers.data ?? []).map((c) => c.city).filter(Boolean) as string[])).sort();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Plan shipment"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={create.isPending}>
              Plan shipment
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label="Direction" htmlFor="s-dir">
            <NativeSelect id="s-dir" {...form.register("direction")}>
              <option value="OUTBOUND">Outbound (to customer)</option>
              <option value="INBOUND">Inbound (from supplier)</option>
            </NativeSelect>
          </Field>
          <Field label="Carrier" htmlFor="s-car" error={e.carrier?.message}>
            <Input id="s-car" list="s-car-list" aria-invalid={!!e.carrier} {...form.register("carrier")} />
            <datalist id="s-car-list">
              {CARRIERS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label={direction === "OUTBOUND" ? "Destination" : "Origin"} htmlFor="s-cp" error={e.counterpart?.message} className="sm:col-span-2">
            <Input id="s-cp" list="s-city-list" placeholder="City, State" aria-invalid={!!e.counterpart} {...form.register("counterpart")} />
            <datalist id="s-city-list">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Scheduled" htmlFor="s-sch" error={e.scheduledAt?.message}>
            <Input id="s-sch" type="datetime-local" {...form.register("scheduledAt")} />
          </Field>
          <Field label="ETA" htmlFor="s-eta" error={e.eta?.message}>
            <Input id="s-eta" type="datetime-local" aria-invalid={!!e.eta} {...form.register("eta")} />
          </Field>
          {direction === "OUTBOUND" && (
            <>
              <Field label="Truck" htmlFor="s-veh">
                <NativeSelect id="s-veh" {...form.register("vehicleId")}>
                  <option value="">Assign later</option>
                  {trucks
                    .filter((t) => t.status !== "MAINTENANCE" && t.status !== "OUT_OF_SERVICE")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.status.toLowerCase().replace(/_/g, " ")}
                        {!t.onSite ? " (away)" : ""}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Field label="Driver" htmlFor="s-drv">
                <NativeSelect id="s-drv" {...form.register("driverId")}>
                  <option value="">Assign later</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </>
          )}
          <Field label="Pallets" htmlFor="s-pc">
            <Input id="s-pc" type="number" min={0} {...form.register("palletCount")} />
          </Field>
          <Field label="Weight (kg)" htmlFor="s-wt">
            <Input id="s-wt" type="number" min={0} {...form.register("weightKg")} />
          </Field>
          {direction === "OUTBOUND" && (ready.data?.items.length ?? 0) > 0 && (
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-[13px] font-medium">Orders ready for dispatch</legend>
              <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {ready.data!.items.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px]">
                    <input
                      type="checkbox"
                      className="accent-brand-600"
                      checked={orderIds.includes(o.id)}
                      onChange={(ev) => form.setValue("orderIds", ev.target.checked ? [...orderIds, o.id] : orderIds.filter((x) => x !== o.id))}
                    />
                    <span className="font-medium">{o.number}</span>
                    <span className="truncate text-ink-muted">{o.customer.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AssignResourcesDialog({
  shipment,
  onClose,
}: {
  shipment: { id: string; trackingNumber: string; vehicle: { id: string } | null; driver: { id: string } | null };
  onClose: () => void;
}) {
  const { trucks, drivers } = useDriversAndTrucks(true);
  const [vehicleId, setVehicleId] = useState(shipment.vehicle?.id ?? "");
  const [driverId, setDriverId] = useState(shipment.driver?.id ?? "");
  const save = useApiMutation<void>({
    path: `/api/shipments/${shipment.id}/assign`,
    body: () => ({ vehicleId: vehicleId || null, driverId: driverId || null }),
    invalidate: INVALIDATE,
    success: "Truck and driver updated",
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Assign truck — ${shipment.trackingNumber}`}
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
        <div className="space-y-4">
          <Field label="Truck" htmlFor="ar-v">
            <NativeSelect id="ar-v" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Unassigned</option>
              {trucks.map((t) => (
                <option key={t.id} value={t.id} disabled={t.status === "MAINTENANCE" || t.status === "OUT_OF_SERVICE"}>
                  {t.code} · {t.status.toLowerCase().replace(/_/g, " ")}
                  {!t.onSite ? " (away)" : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Driver" htmlFor="ar-d">
            <NativeSelect id="ar-d" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.firstName} {d.lastName} · {d.status.toLowerCase().replace(/_/g, " ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssignDockDialog({ shipment, onClose }: { shipment: { id: string; trackingNumber: string; direction: string; vehicle: { id: string } | null }; onClose: () => void }) {
  const docks = useApiQuery<{ docks: { id: string; name: string; direction: string; status: string }[] }>(["scene"], "/api/scene");
  const { trucks } = useDriversAndTrucks(shipment.direction === "OUTBOUND");
  const [dockId, setDockId] = useState("");
  const [vehicleId, setVehicleId] = useState(shipment.vehicle?.id ?? "");
  const save = useApiMutation<void>({
    path: `/api/shipments/${shipment.id}/dock`,
    body: () => ({ dockId, vehicleId: vehicleId || null }),
    invalidate: INVALIDATE,
    success: "Shipment assigned to dock",
    onSuccess: onClose,
  });
  const options = (docks.data?.docks ?? []).filter((d) => d.direction === shipment.direction);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Assign dock — ${shipment.trackingNumber}`}
        description="The truck is moved to the dock door in the 3D view."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dockId || (shipment.direction === "OUTBOUND" && !vehicleId)}>
              Assign
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Dock" htmlFor="ad-d">
            <NativeSelect id="ad-d" value={dockId} onChange={(e) => setDockId(e.target.value)}>
              <option value="">Select a dock…</option>
              {options.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status !== "AVAILABLE"}>
                  {d.name} · {d.status.toLowerCase()}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {shipment.direction === "OUTBOUND" && (
            <Field label="Truck" htmlFor="ad-v" hint="Must be available and on site">
              <NativeSelect id="ad-v" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Select a truck…</option>
                {trucks
                  .filter((t) => (t.status === "AVAILABLE" && t.onSite) || t.id === shipment.vehicle?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code}
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
