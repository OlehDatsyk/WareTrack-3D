"use client";
import { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore } from "@/stores/scene-store";
import { corrugatedTexture, doorTexture, roofTexture } from "./textures";

const WALL_T = 0.4;
const DOOR_W = 3.4;
const DOOR_H = 4.2;
const KNEE = 1.3; // cut-away wall height

function wallTexture(length: number, height: number) {
  const t = corrugatedTexture("#2f6fe4").clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(length / 1.6, height / 3);
  t.needsUpdate = true;
  return t;
}

function Wall({ from, to, height, y0 = 0 }: { from: [number, number]; to: [number, number]; height: number; y0?: number }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const map = useMemo(() => wallTexture(len, height), [len, height]);
  if (len < 0.05 || height <= 0) return null;
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return (
    <group position={[(from[0] + to[0]) / 2, y0 + height / 2, (from[1] + to[1]) / 2]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[len, height, WALL_T]} />
        <meshStandardMaterial map={map} roughness={0.55} metalness={0.15} />
      </mesh>
      {/* fascia trim */}
      {height > 3 && (
        <mesh position={[0, height / 2 - 0.25, 0]}>
          <boxGeometry args={[len + 0.02, 0.5, WALL_T + 0.08]} />
          <meshStandardMaterial color="#1e4fbf" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

function Dock({ dock, open }: { dock: SceneData["docks"][number]; open: boolean }) {
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);
  const door = doorTexture();
  const lightColor = dock.status === "MAINTENANCE" ? "#ef4444" : dock.status === "OCCUPIED" ? "#f59e0b" : "#22c55e";
  const doorDrop = open ? 0.9 : DOOR_H; // visible door height (rolled up when open)
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    select({ kind: "dock", id: dock.id });
  };
  return (
    <group
      position={[dock.posX, 0, dock.posZ]}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover({ kind: "dock", id: dock.id });
      }}
      onPointerOut={() => hover(null)}
    >
      {/* dock seal frame */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.35, (DOOR_H + 0.6) / 2, s * (DOOR_W / 2 + 0.25)]} castShadow>
          <boxGeometry args={[0.5, DOOR_H + 0.6, 0.35]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0.35, DOOR_H + 0.45, 0]} castShadow>
        <boxGeometry args={[0.5, 0.4, DOOR_W + 0.85]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>
      {/* roll-up door */}
      <mesh position={[0.05, DOOR_H - doorDrop / 2, 0]}>
        <boxGeometry args={[0.08, doorDrop, DOOR_W]} />
        <meshStandardMaterial map={door} roughness={0.6} color={dock.status === "MAINTENANCE" ? "#fca5a5" : "#ffffff"} />
      </mesh>
      {open && (
        <mesh position={[-0.05, (DOOR_H - doorDrop) / 2, 0]}>
          <boxGeometry args={[0.04, DOOR_H - doorDrop, DOOR_W]} />
          <meshStandardMaterial color="#334155" roughness={1} />
        </mesh>
      )}
      {/* leveler + bumpers */}
      <mesh position={[0.8, 1.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.2, 0.12, DOOR_W - 0.4]} />
        <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.6, 0.55, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.8, 1.1, DOOR_W + 0.6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[1.05, 1.0, s * 1.2]}>
          <boxGeometry args={[0.2, 0.35, 0.3]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      {/* canopy */}
      <mesh position={[1.4, DOOR_H + 1.0, 0]} castShadow>
        <boxGeometry args={[2.6, 0.15, DOOR_W + 1.2]} />
        <meshStandardMaterial color="#1e4fbf" roughness={0.5} />
      </mesh>
      {/* status light */}
      <mesh position={[0.65, DOOR_H + 0.1, DOOR_W / 2 + 0.55]}>
        <boxGeometry args={[0.2, 0.25, 0.2]} />
        <meshStandardMaterial color={lightColor} emissive={lightColor} emissiveIntensity={1.2} />
      </mesh>
      {/* yellow safety hatch on the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.2, 0.035, 0]}>
        <planeGeometry args={[4.6, DOOR_W]} />
        <meshStandardMaterial color={dock.status === "MAINTENANCE" ? "#fecaca" : "#fde68a"} transparent opacity={0.65} />
      </mesh>
      {/* hit area */}
      <mesh position={[1.6, DOOR_H / 2, 0]} userData={{ kind: "dock" }}>
        <boxGeometry args={[3.4, DOOR_H + 1.5, DOOR_W + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Building({ data, showRoof }: { data: SceneData; showRoof: boolean }) {
  const { buildingWidth: W, buildingDepth: D, layout } = data.warehouse;
  const H = layout.wallHeight;
  const hw = W / 2;
  const hd = D / 2;
  const cutaway = !showRoof;
  const roofMap = useMemo(() => {
    const t = roofTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(W / 20, D / 20);
    t.needsUpdate = true;
    return t;
  }, [W, D]);

  // East wall segments between dock openings
  const docks = [...data.docks].sort((a, b) => a.posZ - b.posZ);
  const eastSegments: [number, number][] = [];
  let z = -hd;
  for (const d of docks) {
    eastSegments.push([z, d.posZ - DOOR_W / 2]);
    z = d.posZ + DOOR_W / 2;
  }
  eastSegments.push([z, hd]);

  const southH = cutaway ? KNEE : H;
  const eastH = cutaway ? KNEE : H;

  return (
    <group>
      {/* floor slab */}
      <mesh position={[0, 0.0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#eef2f7" roughness={0.75} metalness={0.02} />
      </mesh>
      {/* back walls (always full height) */}
      <Wall from={[-hw, -hd]} to={[hw, -hd]} height={H} />
      <Wall from={[-hw, -hd]} to={[-hw, hd]} height={H} />
      {/* front walls: cut away in interior view */}
      <Wall from={[-hw, hd]} to={[hw, hd]} height={southH} />
      {eastSegments.map(([a, b], i) => (
        <Wall key={i} from={[hw, a]} to={[hw, b]} height={eastH} />
      ))}
      {!cutaway &&
        docks.map((d) => (
          <Wall key={`lintel-${d.id}`} from={[hw, d.posZ - DOOR_W / 2]} to={[hw, d.posZ + DOOR_W / 2]} height={H - DOOR_H} y0={DOOR_H} />
        ))}
      {cutaway &&
        docks.map((d) => (
          // door frames remain visible in cut-away mode
          <group key={`frame-${d.id}`}>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[hw, DOOR_H / 2, d.posZ + s * (DOOR_W / 2 + 0.15)]} castShadow>
                <boxGeometry args={[WALL_T, DOOR_H, 0.3]} />
                <meshStandardMaterial color="#1e4fbf" />
              </mesh>
            ))}
            <mesh position={[hw, DOOR_H + 0.15, d.posZ]} castShadow>
              <boxGeometry args={[WALL_T, 0.3, DOOR_W + 0.6]} />
              <meshStandardMaterial color="#1e4fbf" />
            </mesh>
          </group>
        ))}
      {data.docks.map((d) => (
        <Dock key={d.id} dock={d} open={!!d.shipment} />
      ))}

      {/* roof */}
      {showRoof && (
        <group position={[0, H, 0]}>
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[W + 0.6, 0.3, D + 0.6]} />
            <meshStandardMaterial attach="material-0" color="#1e4fbf" />
            <meshStandardMaterial attach="material-1" color="#1e4fbf" />
            <meshStandardMaterial attach="material-2" map={roofMap} roughness={0.6} />
            <meshStandardMaterial attach="material-3" color="#1e4fbf" />
            <meshStandardMaterial attach="material-4" color="#1e4fbf" />
            <meshStandardMaterial attach="material-5" color="#1e4fbf" />
          </mesh>
          {/* roof emblem */}
          <mesh position={[W * 0.12, 0.32, -D * 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[4.2, 40]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[W * 0.12, 0.34, -D * 0.05]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
            <circleGeometry args={[3.0, 6]} />
            <meshStandardMaterial color="#2563eb" />
          </mesh>
          {/* HVAC units */}
          {[-0.3, -0.1, 0.3].map((f, i) => (
            <mesh key={i} position={[W * f, 0.9, D * 0.22]} castShadow>
              <boxGeometry args={[3.2, 1.2, 2.2]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>
          ))}
        </group>
      )}

    </group>
  );
}
