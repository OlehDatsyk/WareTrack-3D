"use client";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { SceneData, SceneTask } from "@/server/services/scene";
import { planRoute, samplePath, pathLength, type SiteLayout, type Vec2 } from "@/lib/layout/geometry";
import { useSceneStore } from "@/stores/scene-store";
import { PalletModel } from "./pallets";
import { trailerTexture } from "./textures";

type Vehicle = SceneData["vehicles"][number];

/** Live poses of moving vehicles, read by the selection marker and camera focus. */
export const vehiclePoses = new Map<string, { x: number; y: number; z: number; heading: number }>();

function angleLerp(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ───────────────────────────── Forklift model ─────────────────────────────

function ForkliftBody({ reach, inactive }: { reach: boolean; inactive: boolean }) {
  const body = reach ? "#f1f5f9" : "#f5b301";
  const accent = reach ? "#2563eb" : "#1f2937";
  return (
    <group>
      {/* chassis */}
      <mesh position={[0, 0.5, -0.15]} castShadow>
        <boxGeometry args={[1.1, 0.55, 1.75]} />
        <meshStandardMaterial color={body} roughness={0.45} metalness={0.1} />
      </mesh>
      {/* counterweight */}
      <mesh position={[0, 0.62, -1.05]} castShadow>
        <boxGeometry args={[1.12, 0.72, 0.45]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      {/* overhead guard */}
      {[
        [-0.48, -0.65],
        [0.48, -0.65],
        [-0.48, 0.42],
        [0.48, 0.42],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x!, 1.45, z!]} castShadow>
          <boxGeometry args={[0.06, 1.35, 0.06]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      <mesh position={[0, 2.13, -0.12]} castShadow>
        <boxGeometry args={[1.04, 0.05, 1.18]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      {/* seat + operator */}
      <mesh position={[0, 0.95, -0.4]}>
        <boxGeometry args={[0.5, 0.35, 0.45]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {!inactive && (
        <group position={[0, 1.15, -0.32]}>
          <mesh position={[0, 0.28, 0]} castShadow>
            <boxGeometry args={[0.42, 0.5, 0.3]} />
            <meshStandardMaterial color="#fb923c" />
          </mesh>
          <mesh position={[0, 0.68, 0]} castShadow>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshStandardMaterial color="#f2c9a5" />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <sphereGeometry args={[0.15, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        </group>
      )}
      {/* beacon */}
      <mesh position={[0, 2.22, -0.55]}>
        <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={inactive ? 0.1 : 1.5} />
      </mesh>
      {/* wheels */}
      {[
        [-0.5, 0.27, 0.45, 0.27],
        [0.5, 0.27, 0.45, 0.27],
        [-0.5, 0.22, -0.8, 0.22],
        [0.5, 0.22, -0.8, 0.22],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x!, y!, z!]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[r!, r!, 0.22, 14]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
      ))}
      {/* mast rails */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 1.25, 0.72]} castShadow>
          <boxGeometry args={[0.08, 2.3, 0.1]} />
          <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Forks({ liftRef, carrying, category }: { liftRef: React.RefObject<THREE.Group | null>; carrying: boolean; category: string | null }) {
  return (
    <group ref={liftRef}>
      <mesh position={[0, 0.35, 0.8]} castShadow>
        <boxGeometry args={[0.8, 0.55, 0.05]} />
        <meshStandardMaterial color="#4b5563" metalness={0.4} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.06, 1.38]} castShadow>
          <boxGeometry args={[0.1, 0.04, 1.15]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {carrying && (
        <group position={[0, 0.08, 1.45]}>
          <PalletModel category={category} />
        </group>
      )}
    </group>
  );
}

const SPEED = 3.2; // m/s for idle repositioning
const TRAVEL_FORK = 0.12;

function Forklift({ v, layout }: { v: Vehicle; layout: SiteLayout }) {
  const root = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);
  const state = useRef<{ x: number; z: number; heading: number; shown: number; idleRoute: Vec2[] | null; idleT: number; idleLen: number; taskId: string | null; target: Vec2 }>({
    x: v.posX,
    z: v.posZ,
    heading: v.heading,
    shown: v.task?.progress ?? 0,
    idleRoute: null,
    idleT: 0,
    idleLen: 0,
    taskId: v.task?.id ?? null,
    target: { x: v.posX, z: v.posZ },
  });
  const task: SceneTask | null = v.task;
  const carryingRef = useRef(false);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const s = state.current;
    const g = root.current;
    if (!g) return;
    let forkY = TRAVEL_FORK;
    if (task) {
      if (s.taskId !== task.id) {
        s.taskId = task.id;
        s.shown = Math.max(0, task.progress - 10);
      }
      // advance smoothly toward (and slightly past) the server's progress
      const target = task.progress;
      const lead = 6;
      const rate = target - s.shown > 15 ? 12 : 3.4; // % per second
      s.shown = Math.min(Math.min(99.5, target + lead), s.shown + rate * dt);
      const t = s.shown / 100;
      const pose = samplePath(task.route, t);
      s.x = pose.x;
      s.z = pose.z;
      s.heading = angleLerp(s.heading, pose.heading, Math.min(1, dt * 8));
      // fork height: raise near pickup and drop-off
      const nearPick = Math.abs(t - task.pickupT) < 0.05;
      const nearDrop = t > 0.95;
      if (nearPick) forkY = Math.max(TRAVEL_FORK, task.fromY);
      else if (nearDrop) forkY = Math.max(TRAVEL_FORK, task.toY);
      carryingRef.current = t >= task.pickupT;
      s.idleRoute = null;
      s.target = { x: v.posX, z: v.posZ };
    } else {
      carryingRef.current = false;
      if (s.taskId) {
        // task just finished: continue from where we are toward the stored pose
        s.taskId = null;
      }
      const tgt = { x: v.posX, z: v.posZ };
      if (!s.idleRoute && Math.hypot(tgt.x - s.x, tgt.z - s.z) > 0.3) {
        s.idleRoute = planRoute(layout, { x: s.x, z: s.z }, tgt);
        s.idleT = 0;
        s.idleLen = Math.max(0.01, pathLength(s.idleRoute));
      }
      if (s.idleRoute) {
        s.idleT = Math.min(1, s.idleT + (SPEED * dt) / s.idleLen);
        const pose = samplePath(s.idleRoute, s.idleT);
        s.x = pose.x;
        s.z = pose.z;
        s.heading = angleLerp(s.heading, pose.heading, Math.min(1, dt * 8));
        if (s.idleT >= 1) s.idleRoute = null;
      } else {
        s.heading = angleLerp(s.heading, v.heading, Math.min(1, dt * 3));
      }
    }
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.heading;
    if (lift.current) {
      lift.current.position.y = THREE.MathUtils.lerp(lift.current.position.y, forkY, Math.min(1, dt * 3));
      const carrying = lift.current.children[3];
      if (carrying) carrying.visible = carryingRef.current;
    }
    vehiclePoses.set(v.id, { x: s.x, y: 0, z: s.z, heading: s.heading });
  });

  const inactive = v.status === "MAINTENANCE" || v.status === "OUT_OF_SERVICE";
  return (
    <group
      ref={root}
      position={[v.posX, 0, v.posZ]}
      rotation={[0, v.heading, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select({ kind: "vehicle", id: v.id });
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover({ kind: "vehicle", id: v.id });
      }}
      onPointerOut={() => hover(null)}
    >
      <ForkliftBody reach={v.type === "REACH_TRUCK"} inactive={inactive} />
      <Forks liftRef={lift} carrying={!!task?.palletId} category={task?.cargoCategory ?? null} />
      {v.status === "CHARGING" && (
        <mesh position={[0, 2.6, -0.5]}>
          <octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.2} />
        </mesh>
      )}
      {inactive && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.8, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

// ───────────────────────────── Trucks ─────────────────────────────

type TruckLook = { cab: string; stripe: string; label: string; kind: "box" | "semi" | "van" };

export function truckLook(carrier: string | null, type: string): TruckLook {
  if (type === "VAN") return { cab: "#f8fafc", stripe: "#2563eb", label: "WareTrack", kind: "van" };
  switch (carrier) {
    case "Bluepeak Logistics":
      return { cab: "#1e3a8a", stripe: "#1e40af", label: "Bluepeak", kind: "semi" };
    case "Northline Carriers":
      return { cab: "#0f766e", stripe: "#0f766e", label: "Northline", kind: "semi" };
    case "Meridian Express":
      return { cab: "#b45309", stripe: "#b45309", label: "Meridian", kind: "semi" };
    case "Harborline Haulage":
      return { cab: "#475569", stripe: "#334155", label: "Harborline", kind: "semi" };
    default:
      return { cab: "#2563eb", stripe: "#2563eb", label: "WareTrack", kind: "box" };
  }
}

export function truckLength(kind: TruckLook["kind"]) {
  return kind === "semi" ? 15.5 : kind === "van" ? 6 : 10;
}

function Wheel({ x, z, r = 0.5 }: { x: number; z: number; r?: number }) {
  return (
    <mesh position={[x, r, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[r, r, 0.35, 16]} />
      <meshStandardMaterial color="#111827" roughness={0.8} />
    </mesh>
  );
}

/** Truck model; forward is +z, origin at the centre of its footprint. */
export function TruckModel({ look }: { look: TruckLook }) {
  const L = truckLength(look.kind);
  const side = useMemo(() => trailerTexture(look.label, look.stripe), [look.label, look.stripe]);
  if (look.kind === "van") {
    return (
      <group>
        <mesh position={[0, 1.35, -0.4]} castShadow>
          <boxGeometry args={[2.1, 2.2, 4.6]} />
          <meshStandardMaterial attach="material-0" map={side} />
          <meshStandardMaterial attach="material-1" map={side} />
          <meshStandardMaterial attach="material-2" color="#f8fafc" />
          <meshStandardMaterial attach="material-3" color="#f8fafc" />
          <meshStandardMaterial attach="material-4" color="#f8fafc" />
          <meshStandardMaterial attach="material-5" color="#f8fafc" />
        </mesh>
        <mesh position={[0, 1.0, 2.35]} castShadow>
          <boxGeometry args={[2.0, 1.5, 1.3]} />
          <meshStandardMaterial color={look.cab} />
        </mesh>
        <mesh position={[0, 1.45, 2.95]}>
          <boxGeometry args={[1.8, 0.6, 0.05]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.2} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <Wheel x={s * 0.95} z={1.9} r={0.38} />
            <Wheel x={s * 0.95} z={-1.8} r={0.38} />
          </group>
        ))}
      </group>
    );
  }
  const cabLen = 2.6;
  const bodyLen = L - cabLen - 0.3;
  const bodyZ = -L / 2 + bodyLen / 2;
  const cabZ = L / 2 - cabLen / 2;
  return (
    <group>
      {/* cargo body / trailer */}
      <mesh position={[0, 2.35, bodyZ]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 3.0, bodyLen]} />
        <meshStandardMaterial attach="material-0" map={side} roughness={0.5} />
        <meshStandardMaterial attach="material-1" map={side} roughness={0.5} />
        <meshStandardMaterial attach="material-2" color="#f8fafc" />
        <meshStandardMaterial attach="material-3" color="#cbd5e1" />
        <meshStandardMaterial attach="material-4" color="#e2e8f0" />
        <meshStandardMaterial attach="material-5" color="#e2e8f0" />
      </mesh>
      {/* chassis */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[1.2, 0.3, L - 0.4]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* cab */}
      <mesh position={[0, 1.75, cabZ]} castShadow>
        <boxGeometry args={[2.45, 2.6, cabLen]} />
        <meshStandardMaterial color={look.cab} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0, 2.25, cabZ + cabLen / 2 + 0.01]}>
        <boxGeometry args={[2.1, 0.9, 0.04]} />
        <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.15} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.85, 0.85, cabZ + cabLen / 2 + 0.02]}>
          <boxGeometry args={[0.35, 0.15, 0.04]} />
          <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Wheel x={s * 1.05} z={cabZ + 0.2} />
          <Wheel x={s * 1.05} z={-L / 2 + 1.4} />
          <Wheel x={s * 1.05} z={-L / 2 + 2.6} />
          {look.kind === "semi" && <Wheel x={s * 1.05} z={cabZ - 1.6} />}
        </group>
      ))}
    </group>
  );
}

function Truck({
  id,
  pose,
  look,
  layout,
  label,
  animateIn,
}: {
  id: string;
  pose: { x: number; z: number; heading: number; docked: boolean };
  look: TruckLook;
  layout: SiteLayout;
  label: string;
  animateIn: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);
  // Arrival animation: drive in from the road, then reverse onto the dock.
  const anim = useRef<{ route: Vec2[]; t: number; len: number; reverseFrom: number } | null>(null);
  const last = useRef<{ x: number; z: number } | null>(null);
  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const moved = last.current && Math.hypot(last.current.x - pose.x, last.current.z - pose.z) > 1;
    if ((!last.current && animateIn) || moved) {
      const start = last.current ?? { x: layout.road.x, z: pose.z + 22 };
      const approach = pose.docked ? { x: pose.x + 13, z: pose.z } : { x: pose.x + 9, z: pose.z };
      const route = [start, { x: layout.road.x - 6, z: start.z }, { x: layout.road.x - 6, z: approach.z }, approach, { x: pose.x, z: pose.z }];
      const len = pathLength(route);
      anim.current = { route, t: 0, len, reverseFrom: (len - Math.hypot(approach.x - pose.x, approach.z - pose.z)) / len };
    }
    last.current = { x: pose.x, z: pose.z };
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + (Math.min(dtRaw, 0.1) * 7) / a.len);
      const p = samplePath(a.route, a.t);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = a.t >= a.reverseFrom ? pose.heading : p.heading;
      if (a.t >= 1) anim.current = null;
    } else {
      g.position.set(pose.x, 0, pose.z);
      g.rotation.y = pose.heading;
    }
    vehiclePoses.set(id, { x: g.position.x, y: 0, z: g.position.z, heading: g.rotation.y });
  });
  const target = { kind: (id.startsWith("dock:") ? "dock" : "vehicle") as "dock" | "vehicle", id: id.replace(/^dock:/, "") };
  return (
    <group
      ref={root}
      position={[pose.x, 0, pose.z]}
      rotation={[0, pose.heading, 0]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        select(target);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(target);
      }}
      onPointerOut={() => hover(null)}
      name={label}
    >
      <TruckModel look={look} />
    </group>
  );
}

export function VehiclesLayer({ data }: { data: SceneData }) {
  const layout = data.warehouse.layout;
  // trucks present on first render appear in place; later arrivals drive in
  const [initialTrucks] = useState(() => new Set([...data.docks.map((d) => d.shipment?.vehicleId ?? `dock:${d.id}`), ...data.vehicles.map((v) => v.id)]));
  const lifts = data.vehicles.filter((v) => (v.type === "FORKLIFT" || v.type === "REACH_TRUCK") && v.onSite);
  const dockedVehicleIds = new Set(data.docks.map((d) => d.shipment?.vehicleId).filter(Boolean) as string[]);

  const trucks: { id: string; look: TruckLook; pose: { x: number; z: number; heading: number; docked: boolean }; label: string }[] = [];
  for (const d of data.docks) {
    if (!d.shipment) continue;
    const v = d.shipment.vehicleId ? data.vehicles.find((x) => x.id === d.shipment!.vehicleId) : null;
    const look = v ? truckLook(v.carrier, v.type) : truckLook(d.shipment.carrier, "TRUCK");
    const L = truckLength(look.kind);
    trucks.push({
      id: v ? v.id : `dock:${d.id}`,
      look,
      pose: { x: d.posX + 1.3 + L / 2, z: d.posZ, heading: Math.PI / 2, docked: true },
      label: v?.code ?? d.shipment.carrier,
    });
  }
  for (const v of data.vehicles) {
    if ((v.type !== "TRUCK" && v.type !== "VAN") || !v.onSite || dockedVehicleIds.has(v.id)) continue;
    trucks.push({ id: v.id, look: truckLook(v.carrier, v.type), pose: { x: v.posX, z: v.posZ, heading: v.heading, docked: false }, label: v.code });
  }

  return (
    <group>
      {lifts.map((v) => (
        <Forklift key={v.id} v={v} layout={layout} />
      ))}
      {trucks.map((t) => (
        <Truck key={t.id} id={t.id} pose={t.pose} look={t.look} layout={layout} label={t.label} animateIn={!initialTrucks.has(t.id)} />
      ))}
    </group>
  );
}
