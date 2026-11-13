"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, KeyRound, Plus, ShieldCheck, UserRound, Users, Warehouse, X } from "lucide-react";
import { changePasswordSchema } from "@/schemas/auth";
import { createUserSchema, notificationCategories, warehouseSettingsSchema } from "@/schemas/admin";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { useCan, useCurrentWarehouse, useSession } from "@/lib/session";
import { usePage, useUrlParam } from "@/lib/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/permissions";
import { NOTIFICATION_CATEGORY } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Avatar, Skeleton, Switch, TBody, TD, TH, THead, TR, Table, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { ErrorState, PageHeader, Pagination, TableSkeleton } from "@/components/common/states";

function ProfileTab() {
  const { data } = useSession();
  if (!data) return <Skeleton className="h-72" />;
  // remount the form whenever the stored profile changes
  return <ProfileForms key={`${data.user.name}|${data.user.title}`} data={data} />;
}

function ProfileForms({ data }: { data: NonNullable<ReturnType<typeof useSession>["data"]> }) {
  const qc = useQueryClient();
  const [name, setName] = useState(data.user.name);
  const [title, setTitle] = useState(data.user.title ?? "");
  const save = useApiMutation<void>({
    method: "PATCH",
    path: "/api/me",
    body: () => ({ name, title: title || null }),
    success: "Profile saved",
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const pw = useForm<z.input<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const changePw = useApiMutation<z.input<typeof changePasswordSchema>>({ path: "/api/auth/password", success: "Password changed", onSuccess: () => pw.reset() });
  const e = pw.formState.errors;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Profile" icon={<UserRound />} />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={data.user.name} className="size-12 text-sm" />
            <div className="text-[13px]">
              <div className="font-semibold">{data.user.email}</div>
              <Badge tone="brand">{ROLE_LABELS[data.user.role]}</Badge>
            </div>
          </div>
          <Field label="Full name" htmlFor="pf-n" error={name.trim().length < 2 ? "Enter your name" : undefined}>
            <Input id="pf-n" value={name} onChange={(ev) => setName(ev.target.value)} maxLength={80} />
          </Field>
          <Field label="Job title" htmlFor="pf-t">
            <Input id="pf-t" value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={80} />
          </Field>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2}>
            Save profile
          </Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change password" icon={<KeyRound />} />
        <CardBody>
          <form className="space-y-4" onSubmit={pw.handleSubmit((v) => changePw.mutate(v))} noValidate>
            <Field label="Current password" htmlFor="pw-c" error={e.currentPassword?.message}>
              <Input id="pw-c" type="password" autoComplete="current-password" {...pw.register("currentPassword")} />
            </Field>
            <Field label="New password" htmlFor="pw-n" error={e.newPassword?.message} hint="At least 10 characters with upper and lower case letters and a number.">
              <Input id="pw-n" type="password" autoComplete="new-password" {...pw.register("newPassword")} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw-r" error={e.confirmPassword?.message}>
              <Input id="pw-r" type="password" autoComplete="new-password" {...pw.register("confirmPassword")} />
            </Field>
            <Button type="submit" loading={changePw.isPending}>
              Update password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function PreferencesTab() {
  const { data } = useSession();
  if (!data) return <Skeleton className="h-72" />;
  return <PreferencesForm key={JSON.stringify([data.user.preferences, data.user.defaultWarehouseId])} data={data} />;
}

function PreferencesForm({ data }: { data: NonNullable<ReturnType<typeof useSession>["data"]> }) {
  const qc = useQueryClient();
  const prefs = (data.user.preferences ?? {}) as { notifications?: { muted?: string[] } };
  const [muted, setMuted] = useState<string[]>(prefs.notifications?.muted ?? []);
  const [defaultWh, setDefaultWh] = useState(data.user.defaultWarehouseId ?? "");
  const save = useApiMutation<void>({
    method: "PATCH",
    path: "/api/me",
    body: () => ({ defaultWarehouseId: defaultWh || null, preferences: { notifications: { muted } } }),
    invalidate: [["notifications"]],
    success: "Preferences saved",
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Application preferences" />
        <CardBody className="space-y-4">
          <Field label="Default warehouse" htmlFor="pr-wh" hint="Used when you sign in on a new device.">
            <NativeSelect id="pr-wh" value={defaultWh} onChange={(e) => setDefaultWh(e.target.value)}>
              {data.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.code})
                </option>
              ))}
            </NativeSelect>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Notification preferences" description="Muted categories are hidden from your bell and unread count." />
        <CardBody className="space-y-2">
          {notificationCategories.map((c) => (
            <label key={c} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
              {NOTIFICATION_CATEGORY[c]}
              <Switch checked={!muted.includes(c)} onCheckedChange={(on) => setMuted((m) => (on ? m.filter((x) => x !== c) : [...m, c]))} aria-label={`${NOTIFICATION_CATEGORY[c]} notifications`} />
            </label>
          ))}
        </CardBody>
      </Card>
      <div className="lg:col-span-2">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

function WarehouseTab() {
  const wh = useCurrentWarehouse();
  const canEdit = useCan("settings:warehouse");
  const qc = useQueryClient();
  const settings = useApiQuery<z.infer<typeof warehouseSettingsSchema> & { code: string; simulationTick: number }>(["warehouse-settings"], wh ? `/api/warehouses/${wh.id}` : null);
  const form = useForm<z.input<typeof warehouseSettingsSchema>>({ resolver: zodResolver(warehouseSettingsSchema) });
  useEffect(() => {
    if (settings.data) form.reset(settings.data);
  }, [settings.data, form]);
  const save = useApiMutation<z.input<typeof warehouseSettingsSchema>>({
    method: "PATCH",
    path: `/api/warehouses/${wh?.id}`,
    invalidate: [["warehouse-settings"], ["simulation"]],
    success: "Warehouse settings saved",
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
  const e = form.formState.errors;
  if (settings.isError) return <ErrorState message={settings.error.message} onRetry={() => settings.refetch()} />;
  if (!settings.data) return <Skeleton className="h-80" />;
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
      <fieldset disabled={!canEdit} className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={`Warehouse ${settings.data.code}`} icon={<Warehouse />} description={canEdit ? undefined : "Only managers and administrators can change these settings."} />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Name" htmlFor="ws-n" error={e.name?.message} className="col-span-2">
              <Input id="ws-n" {...form.register("name")} />
            </Field>
            <Field label="Address" htmlFor="ws-a" error={e.address?.message} className="col-span-2">
              <Input id="ws-a" {...form.register("address")} />
            </Field>
            <Field label="City" htmlFor="ws-c" error={e.city?.message}>
              <Input id="ws-c" {...form.register("city")} />
            </Field>
            <Field label="Time zone" htmlFor="ws-tz" error={e.timezone?.message}>
              <Input id="ws-tz" {...form.register("timezone")} />
            </Field>
            <Field label="Opens" htmlFor="ws-o" error={e.openTime?.message}>
              <Input id="ws-o" type="time" {...form.register("openTime")} />
            </Field>
            <Field label="Closes" htmlFor="ws-cl" error={e.closeTime?.message}>
              <Input id="ws-cl" type="time" {...form.register("closeTime")} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Operations & simulation" />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="Capacity warning (%)" htmlFor="ws-cw" error={e.capacityWarningPct?.message} hint="Zones above this trigger an alert">
              <Input id="ws-cw" type="number" {...form.register("capacityWarningPct")} />
            </Field>
            <Field label="Dock slot (minutes)" htmlFor="ws-ds" error={e.dockSlotMinutes?.message}>
              <Input id="ws-ds" type="number" {...form.register("dockSlotMinutes")} />
            </Field>
            <label className="col-span-2 flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-[13px]">
              <span>
                <span className="block font-medium">Demo simulation running</span>
                <span className="text-xs text-ink-muted">Tick #{settings.data.simulationTick}. Simulated records are labelled SIM.</span>
              </span>
              <Switch checked={!!form.watch("simulationRunning")} onCheckedChange={(v) => form.setValue("simulationRunning", v, { shouldDirty: true })} aria-label="Simulation running" />
            </label>
            <Field label="Tick interval (seconds)" htmlFor="ws-si" error={e.simulationIntervalSec?.message}>
              <Input id="ws-si" type="number" {...form.register("simulationIntervalSec")} />
            </Field>
          </CardBody>
        </Card>
        {canEdit && (
          <div className="lg:col-span-2">
            <Button type="submit" loading={save.isPending}>
              Save warehouse settings
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

type UserRow = { id: string; name: string; email: string; role: keyof typeof ROLE_LABELS; title: string | null; isActive: boolean; lastLoginAt: string | null };

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const form = useForm<z.input<typeof createUserSchema>>({ resolver: zodResolver(createUserSchema), defaultValues: { name: "", email: "", role: "VIEWER", title: "", password: "" } });
  const save = useApiMutation<z.input<typeof createUserSchema>>({ path: "/api/users", invalidate: [["users"]], success: "User created", onSuccess: onClose });
  const e = form.formState.errors;
  const submit = form.handleSubmit((v) => save.mutate(v));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Invite user"
        description="Share the temporary password securely; the user can change it under Settings → Profile."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Create user
            </Button>
          </>
        }
      >
        <form className="grid grid-cols-2 gap-4" onSubmit={submit} noValidate>
          <Field label="Name" htmlFor="cu-n" error={e.name?.message}>
            <Input id="cu-n" {...form.register("name")} />
          </Field>
          <Field label="Email" htmlFor="cu-e" error={e.email?.message}>
            <Input id="cu-e" type="email" {...form.register("email")} />
          </Field>
          <Field label="Role" htmlFor="cu-r">
            <NativeSelect id="cu-r" {...form.register("role")}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Job title" htmlFor="cu-t">
            <Input id="cu-t" {...form.register("title")} />
          </Field>
          <Field label="Temporary password" htmlFor="cu-p" error={e.password?.message} className="col-span-2">
            <Input id="cu-p" type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { data: me } = useSession();
  const users = useApiQuery<UserRow[]>(["users"], "/api/users");
  const [createOpen, setCreateOpen] = useState(false);
  const update = useApiMutation<{ id: string; role?: string; isActive?: boolean }>({
    method: "PATCH",
    path: (i) => `/api/users/${i.id}`,
    body: ({ id: _id, ...rest }) => rest,
    invalidate: [["users"]],
    success: "User updated",
  });
  return (
    <Card>
      <CardHeader
        title="Users & roles"
        icon={<Users />}
        description="Role changes and deactivation sign the user out of all sessions."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> Invite user
          </Button>
        }
      />
      {users.isError ? (
        <ErrorState message={users.error.message} onRetry={() => users.refetch()} />
      ) : !users.data ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Last sign-in</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {users.data.map((u) => {
              const self = u.id === me?.user.id;
              return (
                <TR key={u.id} className={cn(!u.isActive && "opacity-60")}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} />
                      <div>
                        <div className="font-medium">
                          {u.name} {self && <span className="text-xs text-ink-muted">(you)</span>}
                        </div>
                        <div className="text-xs text-ink-muted">{u.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <NativeSelect value={u.role} disabled={self || update.isPending} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} className="w-48" aria-label={`Role for ${u.name}`}>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </NativeSelect>
                  </TD>
                  <TD>{u.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge>Deactivated</Badge>}</TD>
                  <TD className="text-ink-muted">{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : "Never"}</TD>
                  <TD className="text-right">
                    <Button variant={u.isActive ? "destructive-outline" : "outline"} size="sm" disabled={self || update.isPending} onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}>
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {createOpen && <CreateUserDialog onClose={() => setCreateOpen(false)} />}
    </Card>
  );
}

function PermissionsTab() {
  const roles = Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[];
  return (
    <Card>
      <CardHeader title="Roles & access permissions" icon={<ShieldCheck />} description="Permissions are enforced by the server on every API request; the interface only hides what you cannot use." />
      <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((r) => (
          <div key={r} className="rounded-xl border border-line p-3">
            <div className="text-sm font-semibold">{ROLE_LABELS[r]}</div>
            <div className="mt-0.5 text-xs text-ink-muted">{ROLE_DESCRIPTIONS[r]}</div>
          </div>
        ))}
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Permission</TH>
            {roles.map((r) => (
              <TH key={r} className="text-center">
                {ROLE_LABELS[r]}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {PERMISSIONS.map((p) => (
            <TR key={p}>
              <TD className="font-mono text-xs">{p}</TD>
              {roles.map((r) => (
                <TD key={r} className="text-center">
                  {ROLE_PERMISSIONS[r].has(p) ? <Check className="mx-auto size-4 text-success" aria-label="Allowed" /> : <X className="mx-auto size-4 text-slate-300" aria-label="Not allowed" />}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

type AuditRow = { id: string; action: string; entityType: string; entityId: string | null; details: unknown; ip: string | null; createdAt: string; user: { name: string; email: string } | null };

function AuditTab() {
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = usePage(entityType);
  const list = useApiQuery<{ items: AuditRow[]; total: number }>(["audit"], "/api/audit", { page, pageSize: 25, entityType }, { placeholderData: (p) => p });
  return (
    <Card>
      <CardHeader
        title="Audit log"
        description="Security-relevant and data-changing actions."
        action={
          <NativeSelect value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-44" aria-label="Entity type">
            <option value="">All entities</option>
            {["User", "Product", "Pallet", "Order", "Shipment", "Vehicle", "Employee", "Zone", "Task", "Warehouse", "Dock"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        }
      />
      {list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.items.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-ink-muted">{fmtDateTime(a.createdAt)}</TD>
                  <TD className="whitespace-nowrap">{a.user?.name ?? <span className="text-ink-subtle">—</span>}</TD>
                  <TD className="font-mono text-xs">{a.action}</TD>
                  <TD className="text-ink-muted">{a.entityType}</TD>
                  <TD className="max-w-[360px] truncate font-mono text-[11px] text-ink-muted" title={JSON.stringify(a.details)}>
                    {JSON.stringify(a.details)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useUrlParam("tab");
  const canUsers = useCan("users:manage");
  const canAudit = useCan("audit:read");
  const active = tab ?? "profile";
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Settings" description="Your account, preferences, warehouse configuration and access control." />
      <Tabs value={active} onValueChange={(v) => setTab(v)}>
        <TabsList className="mb-5 flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="warehouse">Warehouse</TabsTrigger>
          {canUsers && <TabsTrigger value="users">Users</TabsTrigger>}
          <TabsTrigger value="permissions">Roles & permissions</TabsTrigger>
          {canAudit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="warehouse">
          <WarehouseTab />
        </TabsContent>
        {canUsers && (
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        )}
        <TabsContent value="permissions">
          <PermissionsTab />
        </TabsContent>
        {canAudit && (
          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
