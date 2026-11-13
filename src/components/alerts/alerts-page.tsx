"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bell, BellOff, CheckCheck, ExternalLink, Mail, MailOpen } from "lucide-react";
import type { NotificationItem } from "@/components/layout/notifications-popover";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { usePage, useUrlParam } from "@/lib/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { NOTIFICATION_CATEGORY, NOTIFICATION_PRIORITY } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, SimBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/primitives";
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from "@/components/common/states";
import { PRIORITY_DOT } from "./notification-meta";

function NotificationsTab() {
  const router = useRouter();
  const [urlPriority] = useUrlParam("priority");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState(urlPriority ?? "");
  const [page, setPage] = usePage([status, category, priority]);
  const list = useApiQuery<{ items: NotificationItem[]; total: number }>(["notifications", "list"], "/api/notifications", { status, category, priority, page, pageSize: 15 }, { placeholderData: (p) => p });
  const count = useApiQuery<{ unread: number; critical: number }>(["notifications", "count"], "/api/notifications/count");
  const markAll = useApiMutation<void>({ path: "/api/notifications/read-all", invalidate: [["notifications"]], success: "All notifications marked as read" });
  const toggle = useApiMutation<{ id: string; read: boolean }>({ path: (i) => `/api/notifications/${i.id}/read`, body: (i) => ({ read: i.read }), invalidate: [["notifications"]] });

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">Unread {count.data ? `(${count.data.unread})` : ""}</TabsTrigger>
            <TabsTrigger value="read">Read</TabsTrigger>
          </TabsList>
        </Tabs>
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-40" aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(NOTIFICATION_CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)} className="w-40" aria-label="Priority">
          <option value="">All priorities</option>
          {Object.entries(NOTIFICATION_PRIORITY).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => markAll.mutate()} disabled={!count.data?.unread} loading={markAll.isPending}>
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      {list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <TableSkeleton rows={8} cols={3} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState title="No notifications" icon={<BellOff />} description="Nothing matches these filters." />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {list.data!.items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-4 px-5 py-3.5", !n.read && "bg-brand-50/40")}>
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", PRIORITY_DOT[n.priority], n.read && "opacity-30")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm", n.read ? "font-medium text-ink-muted" : "font-semibold")}>{n.title}</span>
                    <Badge tone={NOTIFICATION_PRIORITY[n.priority]?.tone}>{NOTIFICATION_PRIORITY[n.priority]?.label}</Badge>
                    <Badge>{NOTIFICATION_CATEGORY[n.category]}</Badge>
                    {n.simulated && <SimBadge />}
                    {!n.read && <span className="sr-only">Unread</span>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{n.message}</p>
                  <p className="mt-1 text-[11.5px] text-ink-subtle" title={fmtDateTime(n.createdAt)}>
                    {fmtRelative(n.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {n.link && (
                    <Tooltip content="Open">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Open related item"
                        onClick={() => {
                          if (!n.read) toggle.mutate({ id: n.id, read: true });
                          router.push(n.link!);
                        }}
                      >
                        <ExternalLink />
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip content={n.read ? "Mark as unread" : "Mark as read"}>
                    <Button variant="ghost" size="icon-sm" aria-label={n.read ? "Mark as unread" : "Mark as read"} onClick={() => toggle.mutate({ id: n.id, read: !n.read })}>
                      {n.read ? <Mail /> : <MailOpen />}
                    </Button>
                  </Tooltip>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={15} total={list.data!.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

type ActivityRow = { id: string; type: string; message: string; actorName: string | null; simulated: boolean; createdAt: string };

function ActivityTab() {
  const [source, setSource] = useState("all");
  const [type, setType] = useState("");
  const [page, setPage] = usePage([source, type]);
  const list = useApiQuery<{ items: ActivityRow[]; total: number }>(["activity"], "/api/activity", { source, type, page, pageSize: 25 }, { placeholderData: (p) => p, refetchInterval: 8_000 });
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <Tabs value={source} onValueChange={setSource}>
          <TabsList>
            <TabsTrigger value="all">All activity</TabsTrigger>
            <TabsTrigger value="manual">User actions</TabsTrigger>
            <TabsTrigger value="simulated">Simulated</TabsTrigger>
          </TabsList>
        </Tabs>
        <NativeSelect value={type} onChange={(e) => setType(e.target.value)} className="w-44" aria-label="Activity type">
          <option value="">All types</option>
          {["task", "order", "shipment", "inventory", "pallet", "vehicle", "zone", "dock", "employee", "simulation"].map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </NativeSelect>
      </div>
      {list.isError ? (
        <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <TableSkeleton rows={10} cols={3} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState title="No activity" icon={<Activity />} />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {list.data!.items.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-5 py-2.5 text-[13px]">
                <span className="w-32 shrink-0 text-xs text-ink-subtle tabular">{fmtDateTime(a.createdAt)}</span>
                <span className="w-24 shrink-0 font-mono text-[11px] text-ink-muted">{a.type}</span>
                <span className="min-w-0 flex-1">{a.message}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                  {a.actorName}
                  {a.simulated && <SimBadge />}
                </span>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={25} total={list.data!.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}

export function AlertsPage() {
  const [tab, setTab] = useUrlParam("tab");
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Alerts & notifications" description="Operational alerts for the selected warehouse, plus the full activity log." />
      <Tabs value={tab === "activity" ? "activity" : "notifications"} onValueChange={(v) => setTab(v === "notifications" ? null : v)}>
        <TabsList className="mb-4">
          <TabsTrigger value="notifications">
            <Bell className="size-3.5" /> Notifications
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="size-3.5" /> Activity log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
