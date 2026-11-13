"use client";
/**
 * Lightweight DOM labels for the 3D scene.
 * A single overlay renders all labels as absolutely-positioned elements; a projector
 * inside the canvas moves them every frame. This avoids creating one React root per
 * label (as drei <Html> does) and keeps updates out of React's render cycle.
 */
import { useCallback } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore } from "@/stores/scene-store";
import { cn } from "@/lib/utils";
import { selectionBounds } from "./selection";
import { vehiclePoses } from "./vehicles";

type Anchor = { x: number; y: number; z: number; dynamicId?: string; align?: "center" | "left" };
const anchors = new Map<string, Anchor>();
const elements = new Map<string, HTMLElement>();
const v = new THREE.Vector3();

/** Mount inside <Canvas>. Projects label anchors to screen space every frame. */
export function LabelProjector() {
  useFrame(({ camera, size }) => {
    for (const [id, el] of elements) {
      const a = anchors.get(id);
      if (!a) continue;
      let { x, z } = a;
      if (a.dynamicId) {
        const p = vehiclePoses.get(a.dynamicId);
        if (p) {
          x = p.x;
          z = p.z;
        }
      }
      v.set(x, a.y, z).project(camera);
      const visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      if (!visible) {
        el.style.visibility = "hidden";
        continue;
      }
      const sx = ((v.x + 1) / 2) * size.width;
      const sy = ((1 - v.y) / 2) * size.height;
      el.style.visibility = "visible";
      el.style.transform =
        a.align === "left" ? `translate3d(${sx}px, ${sy}px, 0) translate(0, -50%)` : `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;
    }
  });
  return null;
}

function Label({ id, anchor, children, className }: { id: string; anchor: Anchor; children: React.ReactNode; className?: string }) {
  anchors.set(id, anchor);
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) elements.set(id, el);
      else {
        elements.delete(id);
        anchors.delete(id);
      }
    },
    [id],
  );
  return (
    <div ref={ref} className={cn("absolute top-0 left-0 will-change-transform", className)} style={{ visibility: "hidden" }}>
      {children}
    </div>
  );
}

/** Mount next to <Canvas>, in the same positioned container. */
export function SceneLabels({ data, enabled }: { data: SceneData; enabled: boolean }) {
  const showLabels = useSceneStore((s) => s.showLabels);
  const showZones = useSceneStore((s) => s.showZones);
  const showRoof = useSceneStore((s) => s.showRoof);
  const selection = useSceneStore((s) => s.selection);
  const sel = selectionBounds(data, selection);
  const { buildingWidth: W, buildingDepth: D, layout } = data.warehouse;
  const labels = enabled && showLabels;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {labels && (
        <Label id="building" anchor={{ x: -W / 2 + 6, y: layout.wallHeight + (showRoof ? 2 : 0.8), z: -D / 2 }}>
          <div className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold whitespace-nowrap text-ink shadow-float">
            {data.warehouse.code} · {data.warehouse.name}
          </div>
        </Label>
      )}
      {labels &&
        data.docks.map((d) => (
          <Label key={d.id} id={`dock-${d.id}`} anchor={{ x: d.posX + 0.6, y: 6.6, z: d.posZ }}>
            <div className="rounded bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white">{d.name}</div>
          </Label>
        ))}
      {labels &&
        showZones &&
        data.zones
          .filter((z) => !showRoof || !z.indoor)
          .map((z) => {
            const blocked = z.status === "MAINTENANCE" || z.status === "CLOSED";
            const pct = z.capacity ? Math.round((z.occupied / z.capacity) * 100) : 0;
            return (
              <Label key={z.id} id={`zone-${z.id}`} anchor={{ x: z.x - z.width / 2 + 0.6, y: 0.2, z: z.z - z.depth / 2 + 0.6, align: "left" }}>
                <div className="flex items-center gap-1.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-ink shadow-sm">
                  <span className="size-2 rounded-sm" style={{ background: blocked ? "#dc2626" : z.color }} />
                  {z.name}
                  <span className="font-medium text-ink-muted">{pct}%</span>
                  {blocked && <span className="text-red-600">· {z.status.toLowerCase()}</span>}
                  {z.temperatureC != null && z.temperatureC < 10 && <span className="text-sky-600">{z.temperatureC}°C</span>}
                </div>
              </Label>
            );
          })}
      {enabled && sel && selection && (
        <Label
          key={`pin-${selection.kind}-${selection.id}`}
          id="selection-pin"
          anchor={{ x: sel.center[0], y: sel.center[1] + sel.size[1] / 2 + (sel.flat ? 3 : 1.0), z: sel.center[2], dynamicId: sel.dynamicId }}
        >
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 rounded-full bg-brand-600 py-1 pr-2.5 pl-1 text-[11px] font-semibold whitespace-nowrap text-white shadow-float">
              <span className="flex size-4 items-center justify-center rounded-full bg-white">
                <span className="size-1.5 rounded-full bg-brand-600" />
              </span>
              {sel.label}
            </div>
            <div className="h-3 w-0.5 bg-brand-600" />
            <div className="size-1.5 rounded-full bg-brand-600" />
          </div>
        </Label>
      )}
    </div>
  );
}
