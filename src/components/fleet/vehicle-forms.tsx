"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { maintenanceSchema, vehicleSchema } from "@/schemas/fleet";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { VEHICLE_TYPE } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";

const INVALIDATE = [["fleet"], ["inspect"], ["scene"], ["dashboard"]] as const;
type Emp = { id: string; firstName: string; lastName: string; role: string; vehicle: { id: string; code: string } | null };

type VehicleEditable = {
  id: string;
  code: string;
  type: string;
  model: string;
  registration: string | null;
  carrier: string | null;
  energyType: string;
  energyLevel: number;
  operator: { id?: string } | null;
  operatorId?: string | null;
  nextServiceDue: string | null;
};

export function VehicleFormDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (o: boolean) => void; vehicle?: VehicleEditable }) {
  const employees = useApiQuery<{ items: Emp[] }>(["workforce", "operators"], open ? "/api/employees" : null, { pageSize: 200 });
  const form = useForm<z.input<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: vehicle
      ? {
          code: vehicle.code,
          type: vehicle.type as "FORKLIFT",
          model: vehicle.model,
          registration: vehicle.registration ?? "",
          carrier: vehicle.carrier ?? "",
          energyType: vehicle.energyType as "ELECTRIC",
          energyLevel: vehicle.energyLevel,
          operatorId: vehicle.operatorId ?? "",
          nextServiceDue: (vehicle.nextServiceDue?.slice(0, 10) ?? "") as unknown as Date,
        }
      : { code: "", type: "FORKLIFT", model: "", registration: "", carrier: "", energyType: "ELECTRIC", energyLevel: 100, operatorId: "", nextServiceDue: "" as unknown as Date },
  });
  const type = form.watch("type");
  const road = type === "TRUCK" || type === "VAN";
  const save = useApiMutation<z.input<typeof vehicleSchema>, { code: string }>({
    method: vehicle ? "PATCH" : "POST",
    path: vehicle ? `/api/vehicles/${vehicle.id}` : "/api/vehicles",
    body: (v) => ({
      ...v,
      registration: v.registration || null,
      carrier: v.carrier || null,
      operatorId: v.operatorId || null,
      nextServiceDue: v.nextServiceDue ? v.nextServiceDue : null,
    }),
    invalidate: INVALIDATE,
    success: (v) => (vehicle ? `${v.code} updated` : `${v.code} added to the fleet`),
    onSuccess: () => onOpenChange(false),
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  const candidates = (employees.data?.items ?? []).filter((x) => (road ? x.role === "DRIVER" : x.role === "FORKLIFT_OPERATOR" || x.role === "SUPERVISOR"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={vehicle ? `Edit ${vehicle.code}` : "Add vehicle"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {vehicle ? "Save" : "Add vehicle"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Vehicle ID" htmlFor="v-code" error={e.code?.message}>
            <Input id="v-code" placeholder="FL-07" aria-invalid={!!e.code} {...form.register("code")} onChange={(ev) => form.setValue("code", ev.target.value.toUpperCase())} />
          </Field>
          <Field label="Type" htmlFor="v-type">
            <NativeSelect id="v-type" {...form.register("type")} disabled={!!vehicle}>
              {Object.entries(VEHICLE_TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Model" htmlFor="v-model" error={e.model?.message}>
            <Input id="v-model" aria-invalid={!!e.model} {...form.register("model")} />
          </Field>
          <Field label="Energy" htmlFor="v-en">
            <NativeSelect id="v-en" {...form.register("energyType")}>
              <option value="ELECTRIC">Electric (battery)</option>
              <option value="DIESEL">Diesel (fuel)</option>
            </NativeSelect>
          </Field>
          {road && (
            <>
              <Field label="Registration" htmlFor="v-reg" error={e.registration?.message}>
                <Input id="v-reg" {...form.register("registration")} />
              </Field>
              <Field label="Carrier" htmlFor="v-car">
                <Input id="v-car" placeholder="WareTrack Freight" {...form.register("carrier")} />
              </Field>
            </>
          )}
          <Field label={road ? "Assigned driver" : "Assigned operator"} htmlFor="v-op">
            <NativeSelect id="v-op" {...form.register("operatorId")}>
              <option value="">Unassigned</option>
              {candidates.map((x) => (
                <option key={x.id} value={x.id} disabled={!!x.vehicle && x.vehicle.id !== vehicle?.id}>
                  {x.firstName} {x.lastName}
                  {x.vehicle && x.vehicle.id !== vehicle?.id ? ` (on ${x.vehicle.code})` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Next service due" htmlFor="v-svc">
            <Input id="v-svc" type="date" {...form.register("nextServiceDue")} />
          </Field>
          {!vehicle && (
            <Field label="Current charge / fuel (%)" htmlFor="v-lvl" error={e.energyLevel?.message}>
              <Input id="v-lvl" type="number" min={0} max={100} {...form.register("energyLevel")} />
            </Field>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MaintenanceDialog({ vehicle, onClose }: { vehicle: { id: string; code: string; status: string }; onClose: () => void }) {
  const form = useForm<z.input<typeof maintenanceSchema>>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: { type: "Preventive service", description: "", cost: 0, status: "COMPLETED", performedBy: "In-house workshop" },
  });
  const save = useApiMutation<z.input<typeof maintenanceSchema>>({
    path: `/api/vehicles/${vehicle.id}/maintenance`,
    invalidate: INVALIDATE,
    success: "Maintenance logged",
    onSuccess: onClose,
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Log maintenance — ${vehicle.code}`}
        description="“In progress” takes the vehicle out of operation; “Completed” returns it to service and resets the service interval."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Save record
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label="Type" htmlFor="m-t" error={e.type?.message}>
            <Input id="m-t" list="m-types" {...form.register("type")} />
            <datalist id="m-types">
              {["Preventive service", "Battery check", "Tyre replacement", "Brake service", "Hydraulic repair", "Safety inspection"].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Status" htmlFor="m-s">
            <NativeSelect id="m-s" {...form.register("status")}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="m-d" error={e.description?.message} className="sm:col-span-2">
            <Textarea id="m-d" rows={2} aria-invalid={!!e.description} {...form.register("description")} />
          </Field>
          <Field label="Cost (USD)" htmlFor="m-c" error={e.cost?.message}>
            <Input id="m-c" type="number" min={0} step="0.01" {...form.register("cost")} />
          </Field>
          <Field label="Performed by" htmlFor="m-p">
            <Input id="m-p" {...form.register("performedBy")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
