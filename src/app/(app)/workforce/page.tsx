import { Suspense } from "react";
import type { Metadata } from "next";
import { WorkforcePage } from "@/components/workforce/workforce-page";

export const metadata: Metadata = { title: "Workforce" };

export default function Page() {
  return (
    <Suspense>
      <WorkforcePage />
    </Suspense>
  );
}
