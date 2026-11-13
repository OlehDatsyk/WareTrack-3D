"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { SiteLayout } from "@/lib/layout/geometry";
import { asphaltTexture, containerTexture, windowsTexture } from "./textures";

const tmp = new THREE.Object3D();

/** Instanced flat rectangles (lane markings, parking lines…) on the ground. */
function GroundMarks({ rects, color, y = 0.03 }: { rects: { x: number; z: number; w: number; d: number; r?: number }[]; color: string; y?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    rects.forEach((r, i) => {
      tmp.position.set(r.x, y, r.z);
      tmp.rotation.set(-Math.PI / 2, 0, r.r ?? 0);
      tmp.scale.set(r.w, r.d, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.count = rects.length;
    m.instanceMatrix.needsUpdate = true;
  }, [rects, y]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(rects.length, 1)]} receiveShadow>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </instancedMesh>
  );
}

function Trees({ points }: { points: { x: number; z: number }[] }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const tops = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    points.forEach((p, i) => {
      const s = 0.85 + ((i * 37) % 10) / 25;
      tmp.rotation.set(0, (i * 1.7) % Math.PI, 0);
      tmp.position.set(p.x, 1.1 * s, p.z);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      trunks.current!.setMatrixAt(i, tmp.matrix);
      tmp.position.set(p.x, 3.2 * s, p.z);
      tmp.scale.set(1.9 * s, 2.0 * s, 1.9 * s);
      tmp.updateMatrix();
      crowns.current!.setMatrixAt(i, tmp.matrix);
      tmp.position.set(p.x + 0.3 * s, 4.6 * s, p.z - 0.2 * s);
      tmp.scale.set(1.25 * s, 1.3 * s, 1.25 * s);
      tmp.updateMatrix();
      tops.current!.setMatrixAt(i, tmp.matrix);
    });
    for (const m of [trunks.current!, crowns.current!, tops.current!]) m.instanceMatrix.needsUpdate = true;
  }, [points]);
  const n = Math.max(points.length, 1);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, n]} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 2.2, 6]} />
        <meshStandardMaterial color="#8b6a4f" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, n]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#5fb36b" roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, n]} castShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#79c47f" roughness={0.85} flatShading />
      </instancedMesh>
    </group>
  );
}

function Office({ office }: { office: SiteLayout["office"] }) {
  const h = office.floors * 3.6;
  const tex = useMemo(() => {
    const t = windowsTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(office.width / 8, office.floors / 2);
    t.needsUpdate = true;
    return t;
  }, [office.width, office.floors]);
  const texSide = useMemo(() => {
    const t = windowsTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(office.depth / 8, office.floors / 2);
    t.needsUpdate = true;
    return t;
  }, [office.depth, office.floors]);
  const plain = <meshStandardMaterial color="#f4f7fb" roughness={0.7} />;
  return (
    <group position={[office.x, 0, office.z]}>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[office.width, h, office.depth]} />
        <meshStandardMaterial attach="material-0" map={texSide} roughness={0.5} />
        <meshStandardMaterial attach="material-1" map={texSide} roughness={0.5} />
        <meshStandardMaterial attach="material-2" color="#dfe6f0" roughness={0.8} />
        <meshStandardMaterial attach="material-3" color="#dfe6f0" />
        <meshStandardMaterial attach="material-4" map={tex} roughness={0.5} />
        <meshStandardMaterial attach="material-5" map={tex} roughness={0.5} />
      </mesh>
      <mesh position={[0, h + 0.25, 0]} castShadow>
        <boxGeometry args={[office.width + 0.6, 0.5, office.depth + 0.6]} />
        {plain}
      </mesh>
      {/* entrance canopy */}
      <mesh position={[office.width / 2 - 3, 3.1, -office.depth / 2 - 1.2]} castShadow>
        <boxGeometry args={[4, 0.2, 2.4]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      {/* rooftop units */}
      <mesh position={[-office.width / 4, h + 1, 0]} castShadow>
        <boxGeometry args={[2.4, 1.2, 1.8]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
    </group>
  );
}

function Containers({ items }: { items: SiteLayout["containers"] }) {
  return (
    <group>
      {items.map((c, i) => {
        const tex = containerTexture(c.color, c.label);
        return (
          <mesh key={i} position={[c.x, c.stacked ? 2.6 + 1.3 : 1.3, c.z]} rotation={[0, c.rotation, 0]} castShadow receiveShadow>
            <boxGeometry args={[12.2, 2.6, 2.44]} />
            <meshStandardMaterial attach="material-0" color={c.color} roughness={0.6} />
            <meshStandardMaterial attach="material-1" color={c.color} roughness={0.6} />
            <meshStandardMaterial attach="material-2" color={c.color} roughness={0.6} />
            <meshStandardMaterial attach="material-3" color={c.color} />
            <meshStandardMaterial attach="material-4" map={tex} roughness={0.6} />
            <meshStandardMaterial attach="material-5" map={tex} roughness={0.6} />
          </mesh>
        );
      })}
    </group>
  );
}

function Cars({ lot }: { lot: SiteLayout["carPark"] }) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const cabins = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(() => {
    const out: { x: number; z: number; c: string }[] = [];
    const colors = ["#e2e8f0", "#1e293b", "#2563eb", "#94a3b8", "#b91c1c", "#f8fafc", "#0f766e"];
    const cols = Math.floor(lot.width / 2.8);
    for (let i = 0; i < cols; i++) {
      for (const row of [-1, 1]) {
        if ((i * 7 + (row + 1) * 3) % 5 === 0) continue; // empty bays
        out.push({ x: lot.x - lot.width / 2 + 1.4 + i * 2.8, z: lot.z + row * (lot.depth / 2 - 2.6), c: colors[(i * 3 + row + 7) % colors.length]! });
      }
    }
    return out;
  }, [lot]);
  useLayoutEffect(() => {
    const color = new THREE.Color();
    cars.forEach((car, i) => {
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(car.x, 0.55, car.z);
      tmp.scale.set(1.8, 0.7, 4.2);
      tmp.updateMatrix();
      bodies.current!.setMatrixAt(i, tmp.matrix);
      bodies.current!.setColorAt(i, color.set(car.c));
      tmp.position.set(car.x, 1.15, car.z - 0.2);
      tmp.scale.set(1.6, 0.55, 2.2);
      tmp.updateMatrix();
      cabins.current!.setMatrixAt(i, tmp.matrix);
    });
    bodies.current!.instanceMatrix.needsUpdate = true;
    if (bodies.current!.instanceColor) bodies.current!.instanceColor.needsUpdate = true;
    cabins.current!.instanceMatrix.needsUpdate = true;
  }, [cars]);
  const n = Math.max(cars.length, 1);
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.35} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={cabins} args={[undefined, undefined, n]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.4} />
      </instancedMesh>
    </group>
  );
}

export function Site({ layout, buildingWidth, buildingDepth }: { layout: SiteLayout; buildingWidth: number; buildingDepth: number }) {
  const asphalt = asphaltTexture();
  const { road, apron, carPark } = layout;

  const marks = useMemo(() => {
    const white: { x: number; z: number; w: number; d: number }[] = [];
    const yellow: { x: number; z: number; w: number; d: number }[] = [];
    // road centre dashes + edges
    for (let z = road.zMin + 2; z < road.zMax; z += 6) white.push({ x: road.x, z, w: 0.18, d: 3 });
    white.push({ x: road.x - road.width / 2 + 0.3, z: (road.zMin + road.zMax) / 2, w: 0.14, d: road.zMax - road.zMin });
    white.push({ x: road.x + road.width / 2 - 0.3, z: (road.zMin + road.zMax) / 2, w: 0.14, d: road.zMax - road.zMin });
    // truck parking bays
    for (const p of layout.truckParking) {
      white.push({ x: p.x, z: p.z - 2.2, w: 15, d: 0.14 });
      white.push({ x: p.x, z: p.z + 2.2, w: 15, d: 0.14 });
    }
    // car park bays
    const cols = Math.floor(carPark.width / 2.8);
    for (let i = 0; i <= cols; i++) {
      const x = carPark.x - carPark.width / 2 + i * 2.8;
      white.push({ x, z: carPark.z - carPark.depth / 2 + 2.6, w: 0.12, d: 5 });
      white.push({ x, z: carPark.z + carPark.depth / 2 - 2.6, w: 0.12, d: 5 });
    }
    // dock approach lines
    const east = buildingWidth / 2;
    yellow.push({ x: east + 9, z: 0, w: 0.2, d: buildingDepth - 2 });
    yellow.push({ x: (east + apron.xMax) / 2, z: apron.zMin + 1, w: apron.xMax - east, d: 0.2 });
    return { white, yellow };
  }, [road, carPark, layout.truckParking, buildingWidth, buildingDepth, apron]);

  const walkways = useMemo(
    () =>
      layout.walkways.map((w) => {
        const dx = w.to.x - w.from.x;
        const dz = w.to.z - w.from.z;
        return { x: (w.from.x + w.to.x) / 2, z: (w.from.z + w.to.z) / 2, w: Math.abs(dx) + 1.6, d: Math.abs(dz) + 1.6 };
      }),
    [layout.walkways],
  );

  return (
    <group>
      {/* base ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[520, 520]} />
        <meshStandardMaterial color="#e3e9f1" roughness={1} />
      </mesh>
      {/* lawn ring around the site */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-buildingWidth / 2 - 22, -0.01, 0]} receiveShadow>
        <planeGeometry args={[30, 160]} />
        <meshStandardMaterial color="#dbe8dc" roughness={1} />
      </mesh>
      {/* yard apron */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(apron.xMin + apron.xMax) / 2, 0.005, (apron.zMin + apron.zMax) / 2]} receiveShadow>
        <planeGeometry args={[apron.xMax - apron.xMin, apron.zMax - apron.zMin]} />
        <meshStandardMaterial map={asphalt} color="#e2e8f0" roughness={0.95} />
      </mesh>
      {/* concrete apron around the building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[buildingWidth + 10, buildingDepth + 10]} />
        <meshStandardMaterial color="#d9e0ea" roughness={0.95} />
      </mesh>
      {/* road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[road.x, 0.008, (road.zMin + road.zMax) / 2]} receiveShadow>
        <planeGeometry args={[road.width, road.zMax - road.zMin]} />
        <meshStandardMaterial map={asphalt} color="#b9c4d4" roughness={0.95} />
      </mesh>
      {/* car park */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[carPark.x, 0.008, carPark.z]} receiveShadow>
        <planeGeometry args={[carPark.width, carPark.depth]} />
        <meshStandardMaterial map={asphalt} color="#c7d0dd" roughness={0.95} />
      </mesh>
      <GroundMarks rects={marks.white} color="#ffffff" />
      <GroundMarks rects={marks.yellow} color="#facc15" y={0.032} />
      <GroundMarks rects={walkways} color="#86d19a" y={0.025} />
      <Office office={layout.office} />
      <Cars lot={carPark} />
      <Containers items={layout.containers} />
      <Trees points={layout.trees} />
    </group>
  );
}
