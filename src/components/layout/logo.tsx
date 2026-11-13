import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="wt-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b6ef6" />
          <stop offset="1" stopColor="#1d4fd8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#wt-g)" />
      <path d="M16 6.5 24.5 11v10L16 25.5 7.5 21V11z" fill="#fff" fillOpacity=".14" />
      <path d="M16 6.5 24.5 11 16 15.5 7.5 11z" fill="#fff" />
      <path d="M7.5 11 16 15.5v10L7.5 21z" fill="#fff" fillOpacity=".72" />
      <path d="M24.5 11 16 15.5v10l8.5-4.5z" fill="#fff" fillOpacity=".45" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-ink">
            WareTrack<span className="ml-0.5 text-brand-600">3D</span>
          </div>
          <div className="text-[11px] font-medium text-ink-muted">Bluewater Distribution</div>
        </div>
      )}
    </div>
  );
}
