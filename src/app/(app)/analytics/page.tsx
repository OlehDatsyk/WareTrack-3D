import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyticsPage } from "@/components/analytics/analytics-page";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Suspense>
      <AnalyticsPage />
    </Suspense>
  );
}
