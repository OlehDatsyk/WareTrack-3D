"use client";
import { Suspense, useSyncExternalStore } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr } from "@react-three/drei";
import type { SceneData } from "@/server/services/scene";
import { useSceneStore } from "@/stores/scene-store";
import { Site } from "./site";
import { Building } from "./building";
import { ZonesLayer } from "./zones-layer";
import { Racks } from "./racks";
import { Pallets } from "./pallets";
import { VehiclesLayer } from "./vehicles";
import { SelectionLayer } from "./selection";
import { CameraRig, isoPose } from "./camera-rig";
import { LabelProjector, SceneLabels } from "./labels";

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && canvas.getContext("webgl2")) || !!canvas.getContext("webgl");
  } catch {
    return false;
  }
}

let webglSupport: boolean | undefined;
const noopSubscribe = () => () => undefined;

/** null during SSR/hydration, then true/false once checked in the browser. */
export function useWebGL(): boolean | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (webglSupport ??= hasWebGL()),
    () => null,
  );
}

function Lights({ size }: { size: number }) {
  const s = size * 0.85;
  return (
    <>
      <hemisphereLight args={["#ffffff", "#b4c0d3", 1.15]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[size * 0.55, size * 0.95, size * 0.4]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-s}
        shadow-camera-right={s}
        shadow-camera-top={s}
        shadow-camera-bottom={-s}
        shadow-camera-near={1}
        shadow-camera-far={size * 3}
      />
      <directionalLight position={[-size * 0.6, size * 0.4, -size * 0.5]} intensity={0.45} />
    </>
  );
}

export function SceneContent({ data }: { data: SceneData }) {
  const showRoof = useSceneStore((s) => s.showRoof);
  const showZones = useSceneStore((s) => s.showZones);
  const { buildingWidth: W, buildingDepth: D, layout } = data.warehouse;
  return (
    <>
      <Site layout={layout} buildingWidth={W} buildingDepth={D} />
      <Building data={data} showRoof={showRoof} />
      {!showRoof && (
        <>
          <ZonesLayer zones={data.zones.filter((z) => z.indoor)} showZones={showZones} />
          <Racks racks={data.racks} />
        </>
      )}
      <ZonesLayer zones={data.zones.filter((z) => !z.indoor)} showZones={showZones} />
      <Pallets pallets={showRoof ? data.pallets.filter((p) => !p.rackId && (p.x > W / 2 || p.z < -D / 2 || p.z > D / 2 || p.x < -W / 2)) : data.pallets} />
      <VehiclesLayer data={showRoof ? { ...data, vehicles: data.vehicles.filter((v) => v.type === "TRUCK" || v.type === "VAN") } : data} />
      <SelectionLayer data={data} />
    </>
  );
}

/** The WebGL canvas with lighting, camera rig and the warehouse scene. */
export default function SceneCanvas({ data, labels = true, onMissed }: { data: SceneData; labels?: boolean; onMissed?: () => void }) {
  const { buildingWidth: W, buildingDepth: D } = data.warehouse;
  const iso = isoPose(W, D);
  const size = Math.max(W, D) + 70;
  return (
    <div className="relative h-full w-full">
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 30, near: 1, far: 1200, position: iso.position }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, powerPreference: "high-performance" }}
      onPointerMissed={onMissed}
      aria-label={`3D view of ${data.warehouse.name}`}
    >
      <color attach="background" args={["#e9eef6"]} />
      <fog attach="fog" args={["#e9eef6", size * 2.2, size * 4.5]} />
      <Lights size={size} />
      <Suspense fallback={null}>
        <SceneContent data={data} />
      </Suspense>
      <CameraRig W={W} D={D} interactive />
      <LabelProjector />
      <AdaptiveDpr pixelated={false} />
    </Canvas>
    <SceneLabels data={data} enabled={labels} />
    </div>
  );
}
