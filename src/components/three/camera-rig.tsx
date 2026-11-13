"use client";
import { useEffect, useRef } from "react";
import { CameraControls } from "@react-three/drei";
import { useSceneStore } from "@/stores/scene-store";

/** Isometric-style default framing derived from the building footprint. */
export function isoPose(W: number, D: number) {
  const dist = Math.max(W, D) * 1.45 + 30;
  const dir = { x: 0.58, y: 0.62, z: 0.78 };
  const n = Math.hypot(dir.x, dir.y, dir.z);
  return {
    position: [(dir.x / n) * dist + 6, (dir.y / n) * dist, (dir.z / n) * dist] as [number, number, number],
    target: [6, 0, 2] as [number, number, number],
  };
}

export function CameraRig({ W, D, interactive = true }: { W: number; D: number; interactive?: boolean }) {
  const ref = useRef<CameraControls>(null);
  const command = useSceneStore((s) => s.command);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const iso = isoPose(W, D);
    c.setLookAt(...iso.position, ...iso.target, false);
  }, [W, D]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !command) return;
    const iso = isoPose(W, D);
    switch (command.type) {
      case "reset":
      case "iso":
        void c.setLookAt(...iso.position, ...iso.target, true);
        break;
      case "top":
        void c.setLookAt(iso.target[0], Math.max(W, D) * 1.9, iso.target[2] + 0.01, iso.target[0], 0, iso.target[2], true);
        break;
      case "zoomIn":
        void c.dolly(c.distance * 0.25, true);
        break;
      case "zoomOut":
        void c.dolly(-c.distance * 0.3, true);
        break;
      case "focus":
        if (command.target) {
          const [x, y, z] = command.target;
          void c.setLookAt(x + 18, y + 22, z + 24, x, y, z, true);
        }
        break;
    }
  }, [command, W, D]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      enabled={interactive}
      minDistance={10}
      maxDistance={Math.max(W, D) * 3.2}
      maxPolarAngle={1.32}
      smoothTime={0.35}
      dollyToCursor
    />
  );
}
