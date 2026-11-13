"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ClipboardCheck, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { employeeSchema } from "@/schemas/workforce";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan } from "@/lib/session";
import { useDebounced, usePage, useUrlParam } from "@/lib/hooks";
import { fmtDate, fmtNumber, humanize } from "@/lib/format";
import { EMPLOYEE_ROLE, EMPLOYEE_STATUS, SHIFT, TASK_STATUS, TASK_TYPE } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDialog, Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, ProgressBar, Skeleton, TBody, TD, TH, THead, TR, Table } from "@/components/ui/primitives";
import { DetailRow, EmptyState, ErrorState, PageHeader, Pagination, SectionTitle, StatusBadge, TableSkeleton } from "@/components/common/states";

type Row = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  shift: string;
  status: string;
  tasksCompleted: number;
  unitsPerHour: number;
  accuracyRate: number;
  zone: { id: string; name: string } | null;
  vehicle: { id: string; code: string } | null;
  tasks: { id: string; number: string; description: string; progress: number }[];
};
type Detail = Omit<Row, "tasks"> & {
  phone: string | null;
  hireDate: string;
  certifications: string[];
  zoneId: string | null;
  completedWeek: number;
  user: { email: string; role: string } | null;
  vehicle: { id: string; code: string; model: string; status: string } | null;
  tasks: { id: string; number: string; type: string; status: string; description: string; progress: number; simulated: boolean; completedAt: string | null }[];
};

const INVALIDATE = [["workforce"], ["tasks"], ["fleet"], ["scene"]] as const;

function EmployeeForm({ employee, onClose }: { employee?: Detail; onClose: () => void }) {
  const zones = useApiQuery<{ id: string; name: string }[]>(["zones"], "/api/zones");
  const form = useForm<z.input<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: employee
      ? {
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          phone: employee.phone ?? "",
          role: employee.role as "PICKER",
          shift: employee.shift as "MORNING",
          status: employee.status as "ON_SHIFT",
          zoneId: employee.zoneId ?? "",
          hireDate: employee.hireDate.slice(0, 10) as unknown as Date,
          certifications: employee.certifications,
        }
      : { firstName: "", lastName: "", email: "", phone: "", role: "PICKER", shift: "MORNING", status: "OFF_SHIFT", zoneId: "", hireDate: new Date().toISOString().slice(0, 10) as unknown as Date, certifications: [] },
  });
  const [certs, setCerts] = useState((employee?.certifications ?? []).join(", "));
  const save = useApiMutation<z.input<typeof employeeSchema>, { firstName: string; lastName: string }>({
    method: employee ? "PATCH" : "POST",
    path: employee ? `/api/employees/${employee.id}` : "/api/employees",
    body: (v) => ({ ...v, phone: v.phone || null, certifications: certs.split(",").map((c) => c.trim()).filter(Boolean) }),
    invalidate: INVALIDATE,
    success: (e) => (employee ? "Employee updated" : `${e.firstName} ${e.lastName} added`),
    onSuccess: onClose,
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={employee ? `Edit ${employee.firstName} ${employee.lastName}` : "Add employee"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              {employee ? "Save" : "Add employee"}
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label="First name" htmlFor="e-fn" error={e.firstName?.message}>
            <Input id="e-fn" aria-invalid={!!e.firstName} {...form.register("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="e-ln" error={e.lastName?.message}>
            <Input id="e-ln" aria-invalid={!!e.lastName} {...form.register("lastName")} />
          </Field>
          <Field label="Work email" htmlFor="e-em" error={e.email?.message}>
            <Input id="e-em" type="email" aria-invalid={!!e.email} {...form.register("email")} />
          </Field>
          <Field label="Phone" htmlFor="e-ph" error={e.phone?.message}>
            <Input id="e-ph" type="tel" aria-invalid={!!e.phone} {...form.register("phone")} />
          </Field>
          <Field label="Role" htmlFor="e-role">
            <NativeSelect id="e-role" {...form.register("role")}>
              {Object.entries(EMPLOYEE_ROLE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Shift" htmlFor="e-sh">
            <NativeSelect id="e-sh" {...form.register("shift")}>
              {Object.entries(SHIFT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Availability" htmlFor="e-st">
            <NativeSelect id="e-st" {...form.register("status")}>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Home zone" htmlFor="e-z">
            <NativeSelect id="e-z" {...form.register("zoneId")}>
              <option value="">No fixed zone</option>
              {(zones.data ?? []).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Hire date" htmlFor="e-hd" error={e.hireDate?.message}>
            <Input id="e-hd" type="date" {...form.register("hireDate")} />
          </Field>
          <Field label="Certifications" htmlFor="e-ce" hint="Comma-separated">
            <Input id="e-ce" value={certs} onChange={(ev) => setCerts(ev.target.value)} placeholder="Forklift Class IV, First Aid" />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ employee, onClose }: { employee: Detail; onClose: () => void }) {
  const [taskId, setTaskId] = useState("");
  const tasks = useApiQuery<{ items: { id: string; number: string; type: string; description: string }[] }>(["tasks", "pending"], "/api/tasks", { status: "PENDING", pageSize: 50 });
  const lift = employee.role === "FORKLIFT_OPERATOR" || employee.role === "SUPERVISOR";
  const options = (tasks.data?.items ?? []).filter((t) => lift || !["PUTAWAY", "TRANSFER", "REPLENISH", "LOAD", "UNLOAD"].includes(t.type));
  const assign = useApiMutation<void>({
    path: `/api/employees/${employee.id}/assign`,
    body: () => ({ taskId }),
    invalidate: INVALIDATE,
    success: "Task assigned and started",
    onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Assign ${employee.firstName} to a task`}
        description={lift ? "Pallet-handling tasks use the operator's own forklift when it is available." : "Only tasks that don't need a forklift are listed."}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => assign.mutate()} disabled={!taskId} loading={assign.isPending}>
              Assign & start
            </Button>
          </>
        }
      >
        {options.length === 0 ? (
          <p className="text-sm text-ink-muted">No suitable pending tasks right now.</p>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Pending tasks">
            {options.map((t) => (
              <label key={t.id} className={cn("flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-[13px]", taskId === t.id ? "border-brand-400 bg-brand-50" : "border-line hover:bg-surface-muted")}>
                <input type="radio" name="emp-task" className="mt-1 accent-brand-600" checked={taskId === t.id} onChange={() => setTaskId(t.id)} />
                <span>
                  <span className="font-semibold">{t.number}</span> <span className="text-ink-muted">· {TASK_TYPE[t.type]}</span>
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

function EmployeeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useApiQuery<Detail>(["workforce", "detail", id], id ? `/api/employees/${id}` : null);
  const canWrite = useCan("workforce:write");
  const canTasks = useCan("tasks:write");
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "delete">(null);
  const setStatus = useApiMutation<{ status: string }>({ method: "PATCH", path: `/api/employees/${id}`, invalidate: INVALIDATE, success: (_, i) => `Status set to ${humanize(i.status)}` });
  const del = useApiMutation<void>({
    method: "DELETE",
    path: `/api/employees/${id}`,
    invalidate: INVALIDATE,
    success: "Employee removed",
    onSuccess: () => {
      setDialog(null);
      onClose();
    },
  });
  const current = data?.tasks.find((t) => t.status === "IN_PROGRESS");
  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={data ? `${data.firstName} ${data.lastName}` : "Employee"}
      description={
        data && (
          <span className="flex items-center gap-2">
            {EMPLOYEE_ROLE[data.role]} · {data.employeeCode}
            <StatusBadge map={EMPLOYEE_STATUS} value={data.status} />
          </span>
        )
      }
      footer={
        data && (
          <>
            {canWrite && (
              <Button variant="destructive-outline" size="sm" className="mr-auto" onClick={() => setDialog("delete")}>
                <Trash2 /> Remove
              </Button>
            )}
            {canWrite && (
              <Button variant="outline" size="sm" onClick={() => setDialog("edit")}>
                <Pencil /> Edit
              </Button>
            )}
            {canTasks && (
              <Button size="sm" onClick={() => setDialog("assign")} disabled={data.status !== "ON_SHIFT" || !!current}>
                <ClipboardCheck /> Assign task
              </Button>
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
          <div className="flex items-center gap-4">
            <Avatar name={`${data.firstName} ${data.lastName}`} className="size-14 text-base" />
            <div className="text-[13px]">
              <div className="text-ink-muted">{data.email}</div>
              <div className="text-ink-muted">{data.phone ?? "No phone on file"}</div>
              {data.user && <Badge tone="brand" className="mt-1">App user · {humanize(data.user.role)}</Badge>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["Tasks (7 days)", fmtNumber(data.completedWeek)],
              [data.role === "FORKLIFT_OPERATOR" ? "Moves / hour" : "Units / hour", data.unitsPerHour.toFixed(1)],
              ["Accuracy", `${data.accuracyRate.toFixed(1)}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line p-3">
                <div className="text-[11.5px] text-ink-muted">{k}</div>
                <div className="text-lg font-semibold tabular">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-subtle">Performance indicators are aggregated task metrics. No location or activity monitoring of individuals is recorded.</p>
          <div className="mt-3">
            <DetailRow label="Shift">{SHIFT[data.shift]}</DetailRow>
            <DetailRow label="Home zone">{data.zone?.name ?? "—"}</DetailRow>
            <DetailRow label="Vehicle">{data.vehicle ? `${data.vehicle.code} · ${data.vehicle.model}` : "—"}</DetailRow>
            <DetailRow label="Hire date">{fmtDate(data.hireDate)}</DetailRow>
            <DetailRow label="Lifetime tasks">{fmtNumber(data.tasksCompleted)}</DetailRow>
          </div>
          {data.certifications.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.certifications.map((c) => (
                <Badge key={c} tone="info">
                  {c}
                </Badge>
              ))}
            </div>
          )}
          {canWrite && (
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Availability">
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => (
                <Button key={k} size="sm" variant={data.status === k ? "secondary" : "outline"} disabled={data.status === k || setStatus.isPending} onClick={() => setStatus.mutate({ status: k })}>
                  {v.label}
                </Button>
              ))}
            </div>
          )}
          {current && (
            <>
              <SectionTitle>Current task</SectionTitle>
              <div className="rounded-xl border border-line p-3 text-[13px]">
                <div className="font-semibold">
                  {current.number} · {TASK_TYPE[current.type]}
                </div>
                <div className="text-xs text-ink-muted">{current.description}</div>
                <ProgressBar value={current.progress} className="mt-2" />
              </div>
            </>
          )}
          <SectionTitle>Recent tasks</SectionTitle>
          {data.tasks.length === 0 ? (
            <p className="text-xs text-ink-muted">No tasks yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-[13px]">
                  <span className="font-semibold">{t.number}</span>
                  <span className="truncate text-ink-muted">{t.description}</span>
                  {t.simulated && <SimBadge />}
                  <span className="ml-auto shrink-0">
                    <StatusBadge map={TASK_STATUS} value={t.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {dialog === "edit" && <EmployeeForm employee={data} onClose={() => setDialog(null)} />}
          {dialog === "assign" && <AssignDialog employee={data} onClose={() => setDialog(null)} />}
          <ConfirmDialog
            open={dialog === "delete"}
            onOpenChange={(o) => !o && setDialog(null)}
            title={`Remove ${data.firstName} ${data.lastName}?`}
            description="Their task history remains but will no longer show an assignee. Employees with open tasks cannot be removed."
            confirmLabel="Remove employee"
            destructive
            loading={del.isPending}
            onConfirm={() => del.mutate()}
          />
        </>
      )}
    </Sheet>
  );
}

export function WorkforcePage() {
  const [id, setId] = useUrlParam("id");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [shift, setShift] = useState("");
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const canWrite = useCan("workforce:write");
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage([q, role, shift, status]);
  const list = useApiQuery<{ items: Row[]; total: number; summary: { status: Record<string, number>; shift: Record<string, number> } }>(
    ["workforce", "list"],
    "/api/employees",
    { q, role, shift, status, page, pageSize: 20 },
    { placeholderData: (p) => p },
  );
  const sum = list.data?.summary;
  const headcount = useMemo(() => Object.values(sum?.status ?? {}).reduce((s, n) => s + n, 0), [sum]);

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Workforce"
        description="Team directory, shifts, availability and task assignment."
        actions={
          canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Add employee
            </Button>
          )
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Card className="p-4">
          <div className="text-[12.5px] text-ink-muted">Headcount</div>
          <div className="text-2xl font-semibold tabular">{headcount}</div>
        </Card>
        {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(status === k ? "" : k)}
            className={cn("rounded-[var(--radius-card)] border bg-surface p-4 text-left shadow-card", status === k ? "border-brand-400 ring-2 ring-brand-100" : "border-line hover:border-line-strong")}
          >
            <Badge tone={v.tone} dot>
              {v.label}
            </Badge>
            <div className="mt-1.5 text-2xl font-semibold tabular">{sum?.status[k] ?? 0}</div>
          </button>
        ))}
        <Card className="col-span-2 p-4 lg:col-span-2">
          <div className="mb-2 text-[12.5px] text-ink-muted">By shift</div>
          <div className="space-y-1.5">
            {Object.entries(SHIFT).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="w-28 truncate text-ink-muted">{v}</span>
                <ProgressBar value={headcount ? ((sum?.shift[k] ?? 0) / headcount) * 100 : 0} className="flex-1" label={`${v} share`} />
                <span className="w-6 text-right tabular">{sum?.shift[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, employee ID or email…" className="pl-9" aria-label="Search employees" />
          </div>
          <NativeSelect value={role} onChange={(e) => setRole(e.target.value)} className="w-44" aria-label="Role">
            <option value="">All roles</option>
            {Object.entries(EMPLOYEE_ROLE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={shift} onChange={(e) => setShift(e.target.value)} className="w-44" aria-label="Shift">
            <option value="">All shifts</option>
            {Object.entries(SHIFT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        {list.isError ? (
          <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState title="No employees found" icon={<Users />} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Role</TH>
                  <TH>Shift</TH>
                  <TH>Availability</TH>
                  <TH>Zone / vehicle</TH>
                  <TH>Current task</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Accuracy</TH>
                </TR>
              </THead>
              <TBody>
                {list.data!.items.map((e) => (
                  <TR key={e.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => setId(e.id)} tabIndex={0} onKeyDown={(ev) => ev.key === "Enter" && setId(e.id)}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={`${e.firstName} ${e.lastName}`} />
                        <div>
                          <div className="font-medium whitespace-nowrap">
                            {e.firstName} {e.lastName}
                          </div>
                          <div className="text-xs text-ink-muted">{e.employeeCode}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{EMPLOYEE_ROLE[e.role]}</TD>
                    <TD className="whitespace-nowrap text-ink-muted">{SHIFT[e.shift]?.split(" ·")[0]}</TD>
                    <TD>
                      <StatusBadge map={EMPLOYEE_STATUS} value={e.status} />
                    </TD>
                    <TD className="text-ink-muted">{[e.zone?.name, e.vehicle?.code].filter(Boolean).join(" · ") || "—"}</TD>
                    <TD className="max-w-[240px] truncate text-ink-muted">{e.tasks[0] ? `${e.tasks[0].number} · ${e.tasks[0].description}` : "—"}</TD>
                    <TD className="text-right tabular">{e.unitsPerHour.toFixed(0)}</TD>
                    <TD className="text-right tabular">{e.accuracyRate.toFixed(1)}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
      <EmployeeDrawer id={id} onClose={() => setId(null)} />
      {createOpen && <EmployeeForm onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
