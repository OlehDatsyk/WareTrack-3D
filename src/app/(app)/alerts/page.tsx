import { Suspense } from "react";
import type { Metadata } from "next";
import { AlertsPage } from "@/components/alerts/alerts-page";

export const metadata: Metadata = { title: "Alerts & Notifications" };

export default function Page() {
  return (
    <Suspense>
      <AlertsPage />
    </Suspense>
  );
}
