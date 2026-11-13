"use client";
import type { ThreeEvent } from "@react-three/fiber";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore } from "@/stores/scene-store";

const BORDER = 0.18;

function ZonePatch({ zone }: { zone: SceneData["zones"][number] }) {
  const select = useSceneStore((s) => s.select);
  const hover = useSceneStore((s) => s.hover);
  const selected = useSceneStore((s) => s.selection?.kind === "zone" && s.selection.id === zone.id);
  const hovered = useSceneStore((s) => s.hovered?.kind === "zone" && s.hovered.id === zone.id);
  const blocked = zone.status === "MAINTENANCE" || zone.status === "CLOSED";
  const border = blocked ? "#dc2626" : zone.status === "RESTRICTED" ? "#f59e0b" : zone.color;
  const y = zone.indoor ? 0.012 : 0.02;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // only claim the click when nothing else (pallet, rack, vehicle) was hit in front of the floor
    if (e.intersections[0]?.object !== e.object) return;
    e.stopPropagation();
    select({ kind: "zone", id: zone.id });
  };
  return (
    <group position={[zone.x, y, zone.z]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={onClick}
        onPointerOver={(e) => {
          if (e.intersections[0]?.object !== e.object) return;
          hover({ kind: "zone", id: zone.id });
        }}
        onPointerOut={() => hover(null)}
        userData={{ kind: "zone" }}
      >
        <planeGeometry args={[zone.width, zone.depth]} />
        <meshStandardMaterial
          color={zone.color}
          transparent
          opacity={selected ? 0.22 : hovered ? 0.16 : blocked ? 0.14 : 0.08}
          depthWrite={false}
        />
      </mesh>
      {/* painted floor border */}
      {[
        [0, -zone.depth / 2, zone.width, BORDER],
        [0, zone.depth / 2, zone.width, BORDER],
        [-zone.width / 2, 0, BORDER, zone.depth],
        [zone.width / 2, 0, BORDER, zone.depth],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x!, 0.004, z!]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w!, d!]} />
          <meshBasicMaterial color={border} transparent opacity={selected ? 1 : 0.75} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function ZonesLayer({ zones, showZones }: { zones: SceneData["zones"]; showZones: boolean }) {
  if (!showZones) return null;
  return (
    <group>
      {zones.map((z) => (
        <ZonePatch key={z.id} zone={z} />
      ))}
    </group>
  );
}
