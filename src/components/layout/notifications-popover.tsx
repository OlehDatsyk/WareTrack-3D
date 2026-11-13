"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useApiMutation, useApiQuery } from "@/lib/query";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SimBadge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/primitives";
import { PRIORITY_DOT } from "@/components/alerts/notification-meta";

export type NotificationItem = {
  id: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  link: string | null;
  simulated: boolean;
  createdAt: string;
  read: boolean;
};

export function NotificationsPopover() {
  const router = useRouter();
  const { data: count } = useApiQuery<{ unread: number }>(["notifications", "count"], "/api/notifications/count", undefined, {
    refetchInterval: 15_000,
  });
  const { data } = useApiQuery<{ items: NotificationItem[]; total: number }>(["notifications", "recent"], "/api/notifications", {
    pageSize: 6,
  });
  const markAll = useApiMutation<void>({
    path: "/api/notifications/read-all",
    invalidate: [["notifications"]],
    success: "All notifications marked as read",
  });
  const markOne = useApiMutation<{ id: string }>({
    path: (i) => `/api/notifications/${i.id}/read`,
    invalidate: [["notifications"]],
    body: () => ({ read: true }),
  });
  const unread = count?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-slate-100 hover:text-ink"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface tabular">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-xs text-ink-muted">{unread} unread</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} disabled={!unread || markAll.isPending}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
          {(data?.items ?? []).length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-muted">You&apos;re all caught up.</p>
          ) : (
            data!.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) markOne.mutate({ id: n.id });
                  if (n.link) router.push(n.link);
                }}
                className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-muted", !n.read && "bg-brand-50/40")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", PRIORITY_DOT[n.priority] ?? "bg-slate-300", n.read && "opacity-30")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn("truncate text-[13px]", n.read ? "font-medium text-ink-muted" : "font-semibold text-ink")}>{n.title}</span>
                    {n.simulated && <SimBadge />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-ink-muted">{n.message}</span>
                  <span className="mt-1 block text-[11px] text-ink-subtle">{fmtRelative(n.createdAt)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-line p-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/alerts">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
