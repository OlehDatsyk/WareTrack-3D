import { Suspense } from "react";
import type { Metadata } from "next";
import { ShipmentsPage } from "@/components/shipments/shipments-page";

export const metadata: Metadata = { title: "Shipments" };

export default function Page() {
  return (
    <Suspense>
      <ShipmentsPage />
    </Suspense>
  );
}
