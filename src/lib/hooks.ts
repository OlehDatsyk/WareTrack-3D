"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildUrl } from "./api-client";
import { useAppStore } from "@/stores/app-store";

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Reads/writes a single `?key=` URL parameter (used to deep-link drawers). */
export function useUrlParam(key: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = params.get(key);
  const set = useCallback(
    (next: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (next) p.set(key, next);
      else p.delete(key);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname, key],
  );
  return [value, set] as const;
}

export function useSort<K extends string>(initial: K, dir: "asc" | "desc" = "asc") {
  const [sort, setSort] = useState<{ field: K; dir: "asc" | "desc" }>({ field: initial, dir });
  const toggle = useCallback(
    (field: K) => setSort((s) => (s.field === field ? { field, dir: s.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" })),
    [],
  );
  return [sort, toggle] as const;
}

/** Downloads a server-generated file (CSV export) using the current session + warehouse. */
export async function downloadFile(path: string, query: Record<string, string | number | boolean | undefined | null>, fallbackName: string) {
  const warehouseId = useAppStore.getState().warehouseId;
  const res = await fetch(buildUrl(path, query), { headers: warehouseId ? { "x-warehouse-id": warehouseId } : {}, credentials: "same-origin" });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Client-side CSV builder for small datasets (analytics tables). */
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadText(text: string, filename: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Page number that resets to 1 whenever the filter key changes, without an effect
 * (avoids a cascading render after every filter change).
 */
export function usePage(filterKey: unknown) {
  const key = JSON.stringify(filterKey);
  const [state, setState] = useState<{ key: string; page: number }>({ key, page: 1 });
  const page = state.key === key ? state.page : 1;
  const setPage = useCallback((p: number) => setState({ key, page: p }), [key]);
  return [page, setPage] as const;
}

let nowCache = 0;
function subscribeNow(cb: () => void) {
  const t = setInterval(() => {
    nowCache = Date.now();
    cb();
  }, 30_000);
  return () => clearInterval(t);
}

/**
 * Current time (ms), refreshed every 30 s. Returns 0 during server prerender so no
 * request-time value is baked into the static shell.
 */
export function useNow() {
  return useSyncExternalStore(
    subscribeNow,
    () => (nowCache ||= Date.now()),
    () => 0,
  );
}
