import { Suspense } from "react";
import type { Metadata } from "next";
import { WarehouseView } from "@/components/warehouse/warehouse-view";

export const metadata: Metadata = { title: "3D Warehouse" };

export default function WarehousePage() {
  return (
    <Suspense>
      <WarehouseView />
    </Suspense>
  );
}
