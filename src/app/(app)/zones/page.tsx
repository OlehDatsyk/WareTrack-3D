import { Suspense } from "react";
import type { Metadata } from "next";
import { ZonesPage } from "@/components/zones/zones-page";

export const metadata: Metadata = { title: "Warehouse Zones" };

export default function Page() {
  return (
    <Suspense>
      <ZonesPage />
    </Suspense>
  );
}
