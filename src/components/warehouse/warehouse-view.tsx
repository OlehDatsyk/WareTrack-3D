"use client";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { SceneData } from "@/server/services/scene";
import type { DashboardData } from "@/server/services/dashboard";
import { useApiQuery } from "@/lib/query";
import { useSceneStore, type SelectionKind } from "@/stores/scene-store";
import { ErrorState } from "@/components/common/states";
import { SceneLoading } from "@/components/three/warehouse-preview";
import { useWebGL } from "@/components/three/scene-canvas";
import { WebGLFallback } from "@/components/three/webgl-fallback";
import { selectionBounds } from "@/components/three/selection";
import { Inspector } from "./inspector";
import { KpiChips, OperationsPanel, SceneHint, SceneToolbar, ShipmentTracker } from "./overlays";

const SceneCanvas = dynamic(() => import("@/components/three/scene-canvas"), { ssr: false, loading: () => <SceneLoading /> });

const KINDS: SelectionKind[] = ["pallet", "rack", "vehicle", "zone", "dock"];

export function WarehouseView() {
  const webgl = useWebGL();
  const params = useSearchParams();
  const scene = useApiQuery<SceneData>(["scene"], "/api/scene", undefined, { refetchInterval: 12_000, placeholderData: (prev) => prev });
  const dashboard = useApiQuery<DashboardData>(["dashboard"], "/api/dashboard", undefined, { refetchInterval: 20_000 });
  const selection = useSceneStore((s) => s.selection);
  const select = useSceneStore((s) => s.select);
  const camera = useSceneStore((s) => s.camera);
  const deepLinked = useRef<string | null>(null);

  // Deep link from global search: /warehouse?select=pallet:<id>
  useEffect(() => {
    const raw = params.get("select");
    if (!raw || !scene.data || deepLinked.current === raw) return;
    const [kind, id] = raw.split(":") as [SelectionKind, string];
    if (!KINDS.includes(kind) || !id) return;
    deepLinked.current = raw;
    const sel = { kind, id };
    select(sel);
    const b = selectionBounds(scene.data, sel);
    if (b) camera("focus", b.center);
  }, [params, scene.data, select, camera]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.key === "Escape") select(null);
      else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) camera("reset");
      else if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey) camera(useSceneStore.getState().view === "top" ? "iso" : "top");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, camera]);

  // Leave no stale selection behind when navigating away
  useEffect(() => () => useSceneStore.getState().select(null), []);

  return (
    <div className="relative h-[calc(100vh-64px)] w-full overflow-hidden bg-[#e9eef6]">
      {webgl === false ? (
        <WebGLFallback />
      ) : scene.isError && !scene.data ? (
        <ErrorState message={scene.error.message} onRetry={() => scene.refetch()} className="h-full" />
      ) : !scene.data || webgl === null ? (
        <SceneLoading />
      ) : (
        <>
          <div className="absolute inset-0">
            <SceneCanvas data={scene.data} onMissed={() => select(null)} />
          </div>

          <div className="pointer-events-none absolute inset-0 p-4">
            <div className="pointer-events-auto absolute top-4 left-4">
              <KpiChips dashboard={dashboard.data} scene={scene.data} />
            </div>
            <div className="pointer-events-auto absolute top-[108px] left-4">
              <SceneToolbar />
            </div>
            <div className="pointer-events-auto absolute top-4 right-4 bottom-[260px] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col justify-start">
              {selection ? <Inspector scene={scene.data} /> : <SceneHint />}
            </div>
            <div className="pointer-events-auto absolute bottom-4 left-4 hidden md:block">
              {dashboard.data && <ShipmentTracker shipments={dashboard.data.shipments} />}
            </div>
            <div className="pointer-events-auto absolute right-4 bottom-4">
              <OperationsPanel scene={scene.data} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
