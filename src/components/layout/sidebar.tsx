"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { useSession } from "@/lib/session";
import { useApiQuery } from "@/lib/query";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Avatar, Tooltip } from "@/components/ui/primitives";
import { Logo } from "./logo";
import { NAV_SECTIONS, SETTINGS_ITEM, isActive, type NavItem } from "./nav";

function NavLink({ item, collapsed, badge, onNavigate }: { item: NavItem; collapsed: boolean; badge?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Tooltip content={item.label} side="right" disabled={!collapsed}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
          active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
          collapsed && "justify-center px-0",
        )}
      >
        {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-brand-600" />}
        <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-slate-500 group-hover:text-ink")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!!badge && (
          <span
            className={cn(
              "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white tabular",
              collapsed ? "absolute -top-0.5 right-1" : "ml-auto",
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const collapsedPref = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const { data: me } = useSession();
  const { data: unread } = useApiQuery<{ unread: number }>(["notifications", "count"], "/api/notifications/count", undefined, {
    refetchInterval: 15_000,
  });

  const renderNav = (collapsed: boolean, onNavigate?: () => void) => (
    <>
      <div className={cn("flex h-16 shrink-0 items-center border-b border-line", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <Link href="/" aria-label="WareTrack home" onClick={onNavigate}>
          <Logo collapsed={collapsed} />
        </Link>
      </div>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            {!collapsed ? (
              <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">{section.title}</div>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  badge={item.badgeKey === "alerts" ? unread?.unread : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-3 py-3">
        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />
        {me && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className={cn("mt-2 flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-slate-100", collapsed && "justify-center")}
          >
            <Avatar name={me.user.name} />
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-semibold text-ink">{me.user.name}</div>
                <div className="truncate text-[11.5px] text-ink-muted">{ROLE_LABELS[me.user.role]}</div>
              </div>
            )}
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex",
          collapsedPref ? "w-[72px]" : "w-[248px]",
        )}
      >
        {renderNav(collapsedPref)}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsedPref ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-[22px] -right-3 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-sm hover:text-ink"
        >
          {collapsedPref ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-900/30" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-surface shadow-pop animate-slide-in-right">
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Close navigation"
              className="absolute top-4 right-3 rounded-md p-1.5 text-ink-muted hover:bg-slate-100"
            >
              <X className="size-4" />
            </button>
            {renderNav(false, onMobileClose)}
          </aside>
        </div>
      )}
    </>
  );
}
