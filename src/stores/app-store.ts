"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type AppState = {
  warehouseId: string | null;
  sidebarCollapsed: boolean;
  setWarehouseId: (id: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
};

const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      warehouseId: null,
      sidebarCollapsed: false,
      setWarehouseId: (id) => set({ warehouseId: id }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    { name: "waretrack-app", storage: safeStorage },
  ),
);
