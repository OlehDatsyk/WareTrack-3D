"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function goHome() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears the failed client state
  window.location.assign("/");
}

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">This view failed to load</h1>
        <p className="mt-1 max-w-md text-sm text-ink-muted">An unexpected error occurred. Your data is safe — try again, or return to the overview.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ink-subtle">Reference: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={goHome}>
          Go to overview
        </Button>
        <Button onClick={reset}>
          <RefreshCw /> Try again
        </Button>
      </div>
    </div>
  );
}
