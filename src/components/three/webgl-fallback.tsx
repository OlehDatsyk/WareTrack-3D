import Link from "next/link";
import { MonitorX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WebGLFallback({ compact }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-muted p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-ink-muted">
        <MonitorX className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold">3D view unavailable</p>
        <p className="mt-1 max-w-sm text-[13px] text-ink-muted">
          Your browser or device does not support WebGL. All warehouse data is still available in the zone, inventory and
          fleet views.
        </p>
      </div>
      {!compact && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/zones">Warehouse zones</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory">Inventory</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
