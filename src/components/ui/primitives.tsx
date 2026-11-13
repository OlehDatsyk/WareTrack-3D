"use client";
import { DropdownMenu as DM, Popover as P, Tabs as T, Switch as S, Tooltip as TT } from "radix-ui";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// ───────── Tooltip
export function Tooltip({
  content,
  children,
  side = "top",
  disabled,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <TT.Root>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-xs rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-float data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ───────── Dropdown menu
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;

export function DropdownMenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-pop data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({ className, destructive, ...props }: React.ComponentProps<typeof DM.Item> & { destructive?: boolean }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-slate-100 [&_svg]:size-4 [&_svg]:text-ink-muted",
        destructive && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-ink-muted", className)} {...props} />;
}

export function DropdownMenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-line" />;
}

// ───────── Popover
export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, align = "end", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={8}
        className={cn("z-50 rounded-xl border border-line bg-surface shadow-pop outline-none data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </P.Portal>
  );
}

// ───────── Tabs
export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

// ───────── Switch
export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-600 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

// ───────── Progress
export function ProgressBar({
  value,
  tone = "brand",
  className,
  label,
}: {
  value: number;
  tone?: "brand" | "success" | "warning" | "danger" | "auto" | "energy";
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const color =
    tone === "auto"
      ? v >= 90
        ? "bg-danger"
        : v >= 75
          ? "bg-warning"
          : "bg-brand-600"
      : tone === "energy"
        ? v <= 20
          ? "bg-danger"
          : v <= 40
            ? "bg-warning"
            : "bg-success"
        : { brand: "bg-brand-600", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

// ───────── Avatar
const PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", PALETTE[h % PALETTE.length], className)}
    >
      {initials(name)}
    </span>
  );
}

// ───────── Skeleton
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} {...props} />;
}

// ───────── Table
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="scrollbar-thin w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function THead(props: React.ComponentProps<"thead">) {
  return <thead className="border-b border-line bg-surface-muted/70" {...props} />;
}
export function TBody(props: React.ComponentProps<"tbody">) {
  return <tbody className="divide-y divide-line" {...props} />;
}
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("transition-colors", className)} {...props} />;
}
export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn("h-10 px-4 text-left text-[11.5px] font-semibold tracking-wide whitespace-nowrap text-ink-muted uppercase", className)}
      {...props}
    />
  );
}
export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle text-ink", className)} {...props} />;
}

export function SortableTH<K extends string>({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string;
  field: K;
  sort: { field: K; dir: "asc" | "desc" };
  onSort: (field: K) => void;
  className?: string;
}) {
  const active = sort.field === field;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH className={className} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} />
      </button>
    </TH>
  );
}
