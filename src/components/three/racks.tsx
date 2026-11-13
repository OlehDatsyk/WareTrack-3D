"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { SceneData } from "@/server/services/scene";
import { RACK_FIRST_BEAM } from "@/lib/layout/geometry";
import { useSceneStore } from "@/stores/scene-store";

type Rack = SceneData["racks"][number];
const tmp = new THREE.Object3D();

export function rackHeight(r: Rack) {
  return r.levels * r.levelHeight + (r.kind === "SHELVING" ? 0.2 : 0.35);
}

/** All rack frames rendered with three instanced meshes (uprights, beams, decks). */
export function Racks({ racks }: { racks: Rack[] }) {
  const uprights = useRef<THREE.InstancedMesh>(null);
  const beams = useRef<THREE.InstancedMesh>(null);
  const decks = useRef<THREE.InstancedMesh>(null);
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);

  const parts = useMemo(() => {
    const up: { m: THREE.Matrix4; rack: number; shelf: boolean }[] = [];
    const bm: { m: THREE.Matrix4; rack: number; shelf: boolean }[] = [];
    const dk: { m: THREE.Matrix4; rack: number }[] = [];
    racks.forEach((r, ri) => {
      const shelf = r.kind === "SHELVING";
      const H = rackHeight(r);
      const colW = r.length / r.columns;
      const group = new THREE.Matrix4().compose(
        new THREE.Vector3(r.posX, 0, r.posZ),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rotation),
        new THREE.Vector3(1, 1, 1),
      );
      const add = (list: { m: THREE.Matrix4; rack: number; shelf?: boolean }[], x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        tmp.position.set(x, y, z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(sx, sy, sz);
        tmp.updateMatrix();
        list.push({ m: new THREE.Matrix4().multiplyMatrices(group, tmp.matrix), rack: ri, shelf });
      };
      for (let c = 0; c <= r.columns; c++) {
        const x = -r.length / 2 + c * colW;
        for (const s of [-1, 1]) add(up, x, H / 2, (s * r.depth) / 2, shelf ? 0.05 : 0.09, H, shelf ? 0.05 : 0.09);
      }
      for (let l = 0; l <= r.levels; l++) {
        if (!shelf && l === 0) continue;
        const y = l * r.levelHeight + RACK_FIRST_BEAM - (shelf ? 0.02 : 0.08);
        for (let c = 0; c < r.columns; c++) {
          const x = -r.length / 2 + (c + 0.5) * colW;
          if (shelf) {
            add(dk, x, y, 0, colW - 0.04, 0.03, r.depth);
          } else {
            for (const s of [-1, 1]) add(bm, x, y, (s * r.depth) / 2, colW - 0.06, 0.13, 0.06);
          }
        }
      }
      // diagonal-looking cross bracing on pallet racks: thin horizontal ties at mid-height
      if (!shelf) {
        for (let c = 0; c <= r.columns; c++) {
          const x = -r.length / 2 + c * colW;
          for (const y of [H * 0.3, H * 0.7]) add(bm, x, y, 0, 0.04, 0.04, r.depth);
        }
      }
    });
    return { up, bm, dk };
  }, [racks]);

  useLayoutEffect(() => {
    const color = new THREE.Color();
    const u = uprights.current!;
    parts.up.forEach((p, i) => {
      u.setMatrixAt(i, p.m);
      u.setColorAt(i, color.set(p.shelf ? "#94a3b8" : "#1d4ed8"));
    });
    u.count = parts.up.length;
    u.instanceMatrix.needsUpdate = true;
    if (u.instanceColor) u.instanceColor.needsUpdate = true;
    const b = beams.current!;
    parts.bm.forEach((p, i) => {
      b.setMatrixAt(i, p.m);
      b.setColorAt(i, color.set(p.shelf ? "#94a3b8" : "#f97316"));
    });
    b.count = parts.bm.length;
    b.instanceMatrix.needsUpdate = true;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    const d = decks.current!;
    parts.dk.forEach((p, i) => d.setMatrixAt(i, p.m));
    d.count = parts.dk.length;
    d.instanceMatrix.needsUpdate = true;
  }, [parts]);

  const pick = (list: { rack: number }[]) => (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId == null) return;
    e.stopPropagation();
    const r = racks[list[e.instanceId]!.rack];
    if (r) select({ kind: "rack", id: r.id });
  };
  const over = (list: { rack: number }[]) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null) return;
    e.stopPropagation();
    const r = racks[list[e.instanceId]!.rack];
    if (r) hover({ kind: "rack", id: r.id });
  };

  return (
    <group>
      <instancedMesh
        ref={uprights}
        args={[undefined, undefined, Math.max(parts.up.length, 1)]}
        castShadow
        receiveShadow
        onClick={pick(parts.up)}
        onPointerMove={over(parts.up)}
        onPointerOut={() => hover(null)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.45} metalness={0.35} />
      </instancedMesh>
      <instancedMesh
        ref={beams}
        args={[undefined, undefined, Math.max(parts.bm.length, 1)]}
        castShadow
        onClick={pick(parts.bm)}
        onPointerMove={over(parts.bm)}
        onPointerOut={() => hover(null)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.25} />
      </instancedMesh>
      <instancedMesh
        ref={decks}
        args={[undefined, undefined, Math.max(parts.dk.length, 1)]}
        castShadow
        receiveShadow
        onClick={pick(parts.dk)}
        onPointerMove={over(parts.dk)}
        onPointerOut={() => hover(null)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} metalness={0.2} />
      </instancedMesh>
    </group>
  );
}
