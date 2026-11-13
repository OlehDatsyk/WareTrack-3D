"use client";
import { create } from "zustand";

export type SelectionKind = "pallet" | "rack" | "vehicle" | "zone" | "dock";
export type Selection = { kind: SelectionKind; id: string } | null;
export type CameraCommand = { type: "reset" | "top" | "iso" | "zoomIn" | "zoomOut" | "focus"; target?: [number, number, number]; n: number };

type SceneState = {
  selection: Selection;
  hovered: Selection;
  showRoof: boolean;
  showLabels: boolean;
  showZones: boolean;
  view: "iso" | "top";
  command: CameraCommand | null;
  select: (s: Selection) => void;
  hover: (s: Selection) => void;
  toggleRoof: () => void;
  toggleLabels: () => void;
  toggleZones: () => void;
  camera: (type: CameraCommand["type"], target?: [number, number, number]) => void;
};

export const useSceneStore = create<SceneState>()((set, get) => ({
  selection: null,
  hovered: null,
  showRoof: false,
  showLabels: true,
  showZones: true,
  view: "iso",
  command: null,
  select: (selection) => set({ selection }),
  hover: (hovered) => {
    const h = get().hovered;
    if (h?.id === hovered?.id && h?.kind === hovered?.kind) return;
    set({ hovered });
  },
  toggleRoof: () => set((s) => ({ showRoof: !s.showRoof })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleZones: () => set((s) => ({ showZones: !s.showZones })),
  camera: (type, target) =>
    set((s) => ({
      command: { type, target, n: (s.command?.n ?? 0) + 1 },
      view: type === "top" ? "top" : type === "iso" || type === "reset" ? "iso" : s.view,
    })),
}));
