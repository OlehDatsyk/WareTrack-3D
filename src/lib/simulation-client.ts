"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiQuery } from "./query";

export type SimulationStatus = {
  running: boolean;
  tick: number;
  intervalMs: number;
  lastTickAt: string;
  serverTime: string;
  advanced: boolean;
  events: string[];
};

/**
 * Polls the simulation endpoint. Each poll lets the server advance the deterministic
 * demo simulation by at most one tick if it is due (see src/server/simulation).
 * When a tick happens, live views are invalidated so they refetch.
 */
export function useSimulationHeartbeat() {
  const qc = useQueryClient();
  const query = useApiQuery<SimulationStatus>(["simulation"], "/api/simulation", undefined, {
    refetchInterval: (q) => (q.state.data?.running ? (q.state.data.intervalMs ?? 4000) : 15_000),
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const lastTick = useRef<number | null>(null);
  const tick = query.data?.tick;
  useEffect(() => {
    if (tick == null) return;
    if (lastTick.current != null && tick !== lastTick.current) {
      for (const key of ["scene", "dashboard", "activity", "notifications", "fleet", "shipments", "orders", "tasks", "inventory", "zones"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    }
    lastTick.current = tick;
  }, [tick, qc]);
  return query;
}

/** Read the cached simulation status without starting another poller. */
export function useSimulationStatus() {
  return useApiQuery<SimulationStatus>(["simulation"], "/api/simulation", undefined, { enabled: false });
}
