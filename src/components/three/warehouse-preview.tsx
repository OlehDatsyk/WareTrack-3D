"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { SceneData } from "@/server/services/scene";
import { useApiQuery } from "@/lib/query";
import { useSceneStore } from "@/stores/scene-store";
import { ErrorState } from "@/components/common/states";
import { useWebGL } from "./scene-canvas";
import { WebGLFallback } from "./webgl-fallback";

const SceneCanvas = dynamic(() => import("./scene-canvas"), {
  ssr: false,
  loading: () => <SceneLoading />,
});

export function SceneLoading({ label = "Loading 3D warehouse…" }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#e9eef6] text-[13px] text-ink-muted">
      <Loader2 className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

/** Compact 3D view for the dashboard. Selecting an object opens the full 3D page. */
export function WarehousePreview() {
  const router = useRouter();
  const webgl = useWebGL();
  const { data, isError, error, refetch } = useApiQuery<SceneData>(["scene"], "/api/scene", undefined, { refetchInterval: 15_000 });
  const selection = useSceneStore((s) => s.selection);
  useEffect(() => {
    useSceneStore.getState().select(null);
  }, []);
  useEffect(() => {
    if (selection) router.push("/warehouse");
  }, [selection, router]);

  if (webgl === false) return <WebGLFallback compact />;
  if (isError) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (!data || webgl === null) return <SceneLoading />;
  return <SceneCanvas data={data} labels={false} />;
}
