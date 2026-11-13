import { Suspense } from "react";
import type { Metadata } from "next";
import { FleetPage } from "@/components/fleet/fleet-page";

export const metadata: Metadata = { title: "Fleet Management" };

export default function Page() {
  return (
    <Suspense>
      <FleetPage />
    </Suspense>
  );
}
