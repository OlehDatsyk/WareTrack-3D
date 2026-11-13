"use client";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore, type Selection } from "@/stores/scene-store";
import { PALLET_BASE_H, cargoHeight } from "./pallets";
import { rackHeight } from "./racks";
import { truckLength, truckLook, vehiclePoses } from "./vehicles";

type Bounds = { center: [number, number, number]; size: [number, number, number]; dynamicId?: string; label: string; flat?: boolean };

export function selectionBounds(data: SceneData, sel: Selection): Bounds | null {
  if (!sel) return null;
  switch (sel.kind) {
    case "pallet": {
      const p = data.pallets.find((x) => x.id === sel.id);
      if (!p) return null;
      const h = (p.locationType === "SHELF" ? 0 : PALLET_BASE_H) + cargoHeight(p);
      const shelf = p.locationType === "SHELF";
      return { center: [p.x, p.y + h / 2, p.z], size: [shelf ? 1.0 : 1.3, h + 0.08, shelf ? 0.62 : 1.1], label: p.code };
    }
    case "rack": {
      const r = data.racks.find((x) => x.id === sel.id);
      if (!r) return null;
      const H = rackHeight(r);
      return { center: [r.posX, H / 2, r.posZ], size: [r.length + 0.25, H + 0.1, r.depth + 0.25], label: r.code };
    }
    case "vehicle": {
      const v = data.vehicles.find((x) => x.id === sel.id);
      if (!v || !v.onSite) return null;
      const lift = v.type === "FORKLIFT" || v.type === "REACH_TRUCK";
      const L = lift ? 3.4 : truckLength(truckLook(v.carrier, v.type).kind);
      return { center: [v.posX, lift ? 1.2 : 2, v.posZ], size: lift ? [1.5, 2.5, L] : [2.9, 4.1, L + 0.3], dynamicId: v.id, label: v.code };
    }
    case "dock": {
      const d = data.docks.find((x) => x.id === sel.id);
      if (!d) return null;
      return { center: [d.posX + 1.4, 2.8, d.posZ], size: [3.4, 5.6, 4.8], label: d.name };
    }
    case "zone": {
      const z = data.zones.find((x) => x.id === sel.id);
      if (!z) return null;
      return { center: [z.x, 0.05, z.z], size: [z.width, 0.1, z.depth], label: z.name, flat: true };
    }
  }
}

function boxEdges(sx: number, sy: number, sz: number): [number, number, number][] {
  const x = sx / 2;
  const y = sy / 2;
  const z = sz / 2;
  const c = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, -y, z],
    [-x, -y, z],
    [-x, y, -z],
    [x, y, -z],
    [x, y, z],
    [-x, y, z],
  ] as [number, number, number][];
  const e = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  return e.flatMap(([a, b]) => [c[a!]!, c[b!]!]);
}

function Outline({ bounds, color, width }: { bounds: Bounds; color: string; width: number }) {
  const group = useRef<THREE.Group>(null);
  const points = useMemo(() => boxEdges(...bounds.size), [bounds.size]);
  useFrame(() => {
    if (!bounds.dynamicId || !group.current) return;
    const p = vehiclePoses.get(bounds.dynamicId);
    if (p) {
      group.current.position.set(p.x, bounds.center[1], p.z);
      group.current.rotation.y = p.heading;
    }
  });
  return (
    <group ref={group} position={bounds.center}>
      {bounds.flat ? (
        <Line
          points={[
            [-bounds.size[0] / 2, 0, -bounds.size[2] / 2],
            [bounds.size[0] / 2, 0, -bounds.size[2] / 2],
            [bounds.size[0] / 2, 0, bounds.size[2] / 2],
            [-bounds.size[0] / 2, 0, bounds.size[2] / 2],
            [-bounds.size[0] / 2, 0, -bounds.size[2] / 2],
          ]}
          color={color}
          lineWidth={width + 1}
        />
      ) : (
        <Line points={points} segments color={color} lineWidth={width} transparent opacity={0.95} />
      )}
    </group>
  );
}

export function SelectionLayer({ data }: { data: SceneData }) {
  const selection = useSceneStore((s) => s.selection);
  const hovered = useSceneStore((s) => s.hovered);
  const sel = selectionBounds(data, selection);
  const hov = hovered && (hovered.id !== selection?.id || hovered.kind !== selection?.kind) && hovered.kind !== "zone" ? selectionBounds(data, hovered) : null;
  return (
    <group>
      {sel && <Outline key={`s-${selection!.kind}-${selection!.id}`} bounds={sel} color="#2563eb" width={3} />}
      {hov && <Outline key={`h-${hovered!.kind}-${hovered!.id}`} bounds={hov} color="#93b6fd" width={2} />}
    </group>
  );
}
