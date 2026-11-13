"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Boxes, ClipboardList, Forklift, Loader2, Package, Search, Truck, UserRound } from "lucide-react";
import { useApiQuery } from "@/lib/query";
import { cn } from "@/lib/utils";

type SearchResult = {
  type: "product" | "pallet" | "order" | "shipment" | "vehicle" | "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const ICONS = {
  product: Package,
  pallet: Boxes,
  order: ClipboardList,
  shipment: Truck,
  vehicle: Forklift,
  employee: UserRound,
} as const;

const GROUP_LABEL: Record<SearchResult["type"], string> = {
  product: "Products",
  pallet: "Pallets",
  order: "Orders",
  shipment: "Shipments",
  vehicle: "Vehicles",
  employee: "People",
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeState, setActiveState] = useState<{ q: string; i: number }>({ q: "", i: 0 });
  const router = useRouter();
  const debounced = useDebounced(q.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useApiQuery<SearchResult[]>(["search"], debounced.length >= 2 ? "/api/search" : null, { q: debounced });
  const results = useMemo(() => (debounced.length >= 2 ? (data ?? []) : []), [data, debounced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = activeState.q === debounced ? activeState.i : 0;
  const setActive = (next: number | ((i: number) => number)) =>
    setActiveState((s) => {
      const cur = s.q === debounced ? s.i : 0;
      return { q: debounced, i: typeof next === "function" ? next(cur) : next };
    });

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 text-left text-[13px] text-ink-subtle hover:border-line-strong"
        aria-label="Search"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Search sites, trucks, forklifts, pallets, shipments…</span>
        <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted sm:inline">Ctrl K</kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-slate-900/25 data-[state=open]:animate-fade-in" />
          <D.Content
            className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop data-[state=open]:animate-fade-in"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <D.Title className="sr-only">Search</D.Title>
            <D.Description className="sr-only">Search products, pallets, orders, shipments, vehicles and people</D.Description>
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-ink-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && results[active]) {
                    go(results[active]);
                  }
                }}
                placeholder="Search SKU, pallet, order, tracking number, vehicle, person…"
                className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-subtle"
                aria-label="Search query"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="global-search-results"
              />
              {isFetching && <Loader2 className="size-4 animate-spin text-ink-muted" />}
            </div>
            <div id="global-search-results" role="listbox" className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
              {debounced.length < 2 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-muted">Type at least two characters to search.</p>
              ) : results.length === 0 && !isFetching ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-muted">No matches for “{debounced}”.</p>
              ) : (
                results.map((r, i) => {
                  const Icon = ICONS[r.type];
                  const showGroup = i === 0 || results[i - 1]!.type !== r.type;
                  return (
                    <div key={`${r.type}-${r.id}`}>
                      {showGroup && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">{GROUP_LABEL[r.type]}</div>}
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r)}
                        className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-brand-50")}
                      >
                        <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-ink-muted">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                          <span className="block truncate text-xs text-ink-muted">{r.subtitle}</span>
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
