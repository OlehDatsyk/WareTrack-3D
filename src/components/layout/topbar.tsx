"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  LogOut,
  Menu,
  Pause,
  Play,
  Settings,
  UserRound,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useCan, useCurrentWarehouse, useLogout, useSession } from "@/lib/session";
import { useSimulationHeartbeat } from "@/lib/simulation-client";
import { useApiMutation } from "@/lib/query";
import { fmtTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { GlobalSearch } from "./global-search";
import { NotificationsPopover } from "./notifications-popover";
import { HelpDialog } from "./help-dialog";

function WarehouseSelector() {
  const { data } = useSession();
  const current = useCurrentWarehouse();
  const setWarehouseId = useAppStore((s) => s.setWarehouseId);
  const qc = useQueryClient();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-left hover:bg-surface-muted"
          aria-label="Select warehouse"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-brand-600 text-[10px] font-bold text-white">
            {current?.code.replace("WH-", "") ?? "—"}
          </span>
          <span className="hidden leading-tight md:block">
            <span className="block text-[12.5px] font-semibold text-ink">{current?.name ?? "Loading…"}</span>
            <span className="block text-[11px] text-ink-muted">{current?.city ?? ""}</span>
          </span>
          <ChevronDown className="size-4 text-ink-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch warehouse</DropdownMenuLabel>
        {data?.warehouses.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => {
              setWarehouseId(w.id);
              void qc.invalidateQueries();
            }}
          >
            <Building2 />
            <div className="flex-1 leading-tight">
              <div className="font-medium">
                {w.name} <span className="text-ink-muted">· {w.code}</span>
              </div>
              <div className="text-xs text-ink-muted">{w.city}</div>
            </div>
            {current?.id === w.id && <Check className="!text-brand-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LiveStatus() {
  const { data } = useSimulationHeartbeat();
  const canControl = useCan("simulation:control");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000 * 15);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const toggle = useApiMutation<{ running: boolean }>({
    path: "/api/simulation",
    method: "PATCH",
    invalidate: [["simulation"]],
    success: (_, i) => (i.running ? "Simulation resumed" : "Simulation paused"),
  });
  const running = data?.running ?? false;
  return (
    <div className="flex h-9 items-center gap-1 rounded-lg border border-line bg-surface pr-1 pl-2.5">
      <Tooltip content={running ? "Demo simulation is running — simulated activity is labelled SIM" : "Demo simulation is paused"}>
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <span className={cn("size-2 rounded-full", running ? "animate-pulse-dot bg-success" : "bg-slate-400")} />
          <span className={running ? "text-green-700" : "text-ink-muted"}>{running ? "Live" : "Paused"}</span>
          <span className="hidden font-medium text-ink-muted tabular sm:inline">{now ? fmtTime(now) : "--:--"}</span>
        </span>
      </Tooltip>
      {canControl && data && (
        <Tooltip content={running ? "Pause simulation" : "Resume simulation"}>
          <button
            type="button"
            onClick={() => toggle.mutate({ running: !running })}
            disabled={toggle.isPending}
            className="ml-1 flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-slate-100 hover:text-ink"
            aria-label={running ? "Pause simulation" : "Resume simulation"}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function UserMenu() {
  const { data } = useSession();
  const logout = useLogout();
  if (!data) return <div className="size-9 rounded-full bg-slate-100" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100" aria-label="Account menu">
          <Avatar name={data.user.name} />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-[12.5px] font-semibold">{data.user.name}</span>
            <span className="block text-[11px] text-ink-muted">{data.user.title ?? ROLE_LABELS[data.user.role]}</span>
          </span>
          <ChevronDown className="hidden size-4 text-ink-muted xl:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <div className="px-2.5 py-2">
          <div className="text-sm font-semibold">{data.user.name}</div>
          <div className="truncate text-xs text-ink-muted">{data.user.email}</div>
          <div className="mt-1.5 inline-flex rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
            {ROLE_LABELS[data.user.role]}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings?tab=profile">
            <UserRound /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMobileNav} aria-label="Open navigation">
        <Menu />
      </Button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <WarehouseSelector />
        <LiveStatus />
        <NotificationsPopover />
        <Tooltip content="Help & shortcuts">
          <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)} aria-label="Help">
            <CircleHelp />
          </Button>
        </Tooltip>
        <UserMenu />
      </div>
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}
