"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore } from "@/stores/scene-store";
import { cardboardTexture } from "./textures";

type Pallet = SceneData["pallets"][number];

export const CATEGORY_COLORS: Record<string, string> = {
  "PPE & Safety": "#d9a95f",
  Electronics: "#c39a66",
  Packaging: "#dcb27a",
  "Food & Beverage": "#eef3fa",
  Household: "#d6ad78",
  Automotive: "#b98b5a",
  "Tools & Hardware": "#cfa36c",
  "Office Supplies": "#e3c391",
};
const TOTE_COLORS = ["#4f86ea", "#60a5fa", "#94a3b8", "#3b82f6"];

export const PALLET_BASE_H = 0.14;

/** Cargo height for a pallet, bounded by the slot it sits in. */
export function cargoHeight(p: Pick<Pallet, "weight" | "locationType">) {
  if (p.locationType === "SHELF") return Math.min(0.62, 0.22 + p.weight / 260);
  const h = 0.35 + Math.min(1, p.weight / 650) * 0.95;
  return p.locationType === "RACK" ? Math.min(h, 1.28) : h;
}

type Part = { pallet: number };
const tmp = new THREE.Object3D();
const color = new THREE.Color();

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Renders every stored pallet with two instanced meshes: wooden bases and cargo boxes
 * (2×2 grid, 1–3 layers depending on load). Shelf locations hold plastic totes instead.
 */
export function Pallets({ pallets }: { pallets: Pallet[] }) {
  const bases = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);
  const tex = cardboardTexture();

  const { baseParts, boxParts, capacity } = useMemo(() => {
    const baseParts: (Part & { m: THREE.Matrix4; c: string })[] = [];
    const boxParts: (Part & { m: THREE.Matrix4; c: string })[] = [];
    pallets.forEach((p, pi) => {
      const h = hash(p.id);
      const rot = p.rotated ? Math.PI / 2 : 0;
      const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        tmp.position.set(p.x + (rot ? z : x), p.y + y, p.z + (rot ? x : z));
        tmp.rotation.set(0, rot + (((h % 7) - 3) * 0.004), 0);
        tmp.scale.set(sx, sy, sz);
        tmp.updateMatrix();
        return tmp.matrix.clone();
      };
      const ch = cargoHeight(p);
      const damaged = p.status === "DAMAGED";
      if (p.locationType === "SHELF") {
        const tote = TOTE_COLORS[h % TOTE_COLORS.length]!;
        for (const dx of [-0.24, 0.24]) {
          const th = ch * (0.75 + ((h >> 3) % 5) / 20);
          boxParts.push({ pallet: pi, m: place(dx, th / 2 + 0.01, 0, 0.44, th, 0.52), c: damaged ? "#d07a6a" : tote });
        }
        return;
      }
      baseParts.push({ pallet: pi, m: place(0, PALLET_BASE_H / 2, 0, 1.18, PALLET_BASE_H, 0.98), c: (h & 1) === 0 ? "#c9a06b" : "#b98f5e" });
      const layers = ch < 0.6 ? 1 : ch < 1.0 ? 2 : 3;
      const lh = ch / layers;
      const base = CATEGORY_COLORS[p.category] ?? "#d6ab72";
      const wrapped = p.category === "Food & Beverage";
      for (let l = 0; l < layers; l++) {
        for (const [dx, dz] of [
          [-0.29, -0.24],
          [0.29, -0.24],
          [-0.29, 0.24],
          [0.29, 0.24],
        ] as const) {
          // skip some boxes on the top layer of partially filled pallets
          if (l === layers - 1 && layers > 1 && ((h >> (l * 2 + (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0))) & 3) === 0) continue;
          const shade = 0.92 + (((h >> (l + 2)) % 9) / 100);
          color.set(damaged ? "#d07a6a" : base).multiplyScalar(wrapped ? 1 : shade);
          boxParts.push({
            pallet: pi,
            m: place(dx, PALLET_BASE_H + lh * l + lh / 2, dz, 0.56, lh - 0.025, 0.46),
            c: `#${color.getHexString()}`,
          });
        }
      }
    });
    return { baseParts, boxParts, capacity: Math.max(64, Math.ceil((boxParts.length + 1) / 512) * 512) };
  }, [pallets]);

  useLayoutEffect(() => {
    const b = bases.current;
    const x = boxes.current;
    if (!b || !x) return;
    baseParts.forEach((p, i) => {
      b.setMatrixAt(i, p.m);
      b.setColorAt(i, color.set(p.c));
    });
    b.count = baseParts.length;
    b.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    boxParts.forEach((p, i) => {
      x.setMatrixAt(i, p.m);
      x.setColorAt(i, color.set(p.c));
    });
    x.count = boxParts.length;
    x.instanceMatrix.needsUpdate = true;
    if (x.instanceColor) x.instanceColor.needsUpdate = true;
    b.computeBoundingSphere();
    x.computeBoundingSphere();
  }, [baseParts, boxParts]);

  const onClick = (parts: Part[]) => (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null) return;
    e.stopPropagation();
    const p = pallets[parts[e.instanceId]!.pallet];
    if (p) select({ kind: "pallet", id: p.id });
  };
  const onMove = (parts: Part[]) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null) return;
    e.stopPropagation();
    const p = pallets[parts[e.instanceId]!.pallet];
    if (p) hover({ kind: "pallet", id: p.id });
  };

  return (
    <group>
      <instancedMesh
        key={`b-${capacity}`}
        ref={bases}
        args={[undefined, undefined, capacity]}
        castShadow
        receiveShadow
        onClick={onClick(baseParts)}
        onPointerMove={onMove(baseParts)}
        onPointerOut={() => hover(null)}
        userData={{ kind: "pallet" }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        key={`x-${capacity}`}
        ref={boxes}
        args={[undefined, undefined, capacity]}
        castShadow
        receiveShadow
        onClick={onClick(boxParts)}
        onPointerMove={onMove(boxParts)}
        onPointerOut={() => hover(null)}
        userData={{ kind: "pallet" }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={tex} roughness={0.85} />
      </instancedMesh>
    </group>
  );
}

/** A single pallet with cargo, used for loads carried on forks. */
export function PalletModel({ category }: { category: string | null }) {
  const base = CATEGORY_COLORS[category ?? ""] ?? "#d6ab72";
  const tex = cardboardTexture();
  return (
    <group>
      <mesh position={[0, PALLET_BASE_H / 2, 0]} castShadow>
        <boxGeometry args={[1.18, PALLET_BASE_H, 0.98]} />
        <meshStandardMaterial color="#c9a06b" roughness={0.9} />
      </mesh>
      {[
        [-0.29, -0.24],
        [0.29, -0.24],
        [-0.29, 0.24],
        [0.29, 0.24],
      ].map(([dx, dz], i) => (
        <group key={i}>
          <mesh position={[dx!, PALLET_BASE_H + 0.22, dz!]} castShadow>
            <boxGeometry args={[0.56, 0.42, 0.46]} />
            <meshStandardMaterial map={tex} color={base} roughness={0.85} />
          </mesh>
          {i < 3 && (
            <mesh position={[dx!, PALLET_BASE_H + 0.65, dz!]} castShadow>
              <boxGeometry args={[0.56, 0.42, 0.46]} />
              <meshStandardMaterial map={tex} color={base} roughness={0.85} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
