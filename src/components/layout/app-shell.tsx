"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/common/states";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** Pages that render edge-to-edge (no page padding), e.g. the 3D viewport. */
const FULL_BLEED = ["/warehouse"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const pathname = usePathname();
  const session = useSession();
  const warehouseId = useAppStore((s) => s.warehouseId);
  const fullBleed = FULL_BLEED.includes(pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={mobileNav} onMobileClose={() => setMobileNav(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNav(true)} />
        <main className={cn("min-w-0 flex-1", fullBleed ? "relative" : "px-4 py-6 lg:px-8")}>
          {session.isError ? (
            <ErrorState message={session.error.message} onRetry={() => session.refetch()} />
          ) : (
            <>
              {(!session.data || !warehouseId) && (
                <div className="pointer-events-none fixed top-20 left-1/2 z-10 -translate-x-1/2 text-ink-muted" aria-busy="true">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              )}
              {children}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
