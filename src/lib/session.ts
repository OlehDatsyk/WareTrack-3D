"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api-client";
import { can, type Permission } from "./permissions";
import { useAppStore } from "@/stores/app-store";
import type { Role } from "@/generated/prisma/enums";

export type Me = {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    title: string | null;
    defaultWarehouseId: string | null;
    preferences: Record<string, unknown>;
  };
  permissions: Permission[];
  warehouses: { id: string; code: string; name: string; city: string }[];
};

export function useSession() {
  const setWarehouseId = useAppStore((s) => s.setWarehouseId);
  const warehouseId = useAppStore((s) => s.warehouseId);
  const query = useQuery<Me, ApiError>({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const valid = data.warehouses.some((w) => w.id === warehouseId);
    if (!valid) {
      const next = data.user.defaultWarehouseId ?? data.warehouses[0]?.id;
      if (next) setWarehouseId(next);
    }
  }, [data, warehouseId, setWarehouseId]);
  return query;
}

export function useCan(permission: Permission) {
  const { data } = useSession();
  return can(data?.user.role, permission);
}

export function useCurrentWarehouse() {
  const { data } = useSession();
  const warehouseId = useAppStore((s) => s.warehouseId);
  return data?.warehouses.find((w) => w.id === warehouseId) ?? null;
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    qc.clear();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload to reset client caches
    window.location.assign("/login");
  };
}
