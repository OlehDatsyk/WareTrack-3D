"use client";
import Link from "next/link";
import { Boxes, Maximize2 } from "lucide-react";
import type { DashboardData } from "@/server/services/dashboard";
import { useApiQuery } from "@/lib/query";
import { useNow } from "@/lib/hooks";
import { useCurrentWarehouse, useSession } from "@/lib/session";
import { fmtTime } from "@/lib/format";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { ErrorState, PageHeader } from "@/components/common/states";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { ActiveShipments, ActivityFeed, CriticalAlerts, PendingOrders, ZoneOccupancy } from "@/components/dashboard/panels";
import { WarehousePreview } from "@/components/three/warehouse-preview";

export default function OverviewPage() {
  const { data: me } = useSession();
  const wh = useCurrentWarehouse();
  const { data, isLoading, isError, error, refetch } = useApiQuery<DashboardData>(["dashboard"], "/api/dashboard", undefined, {
    refetchInterval: 20_000,
  });
  const first = me?.user.name.split(" ")[0];
  const now = useNow();
  const hour = now ? new Date(now).getHours() : null;
  const greeting = hour == null ? "Welcome back" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title={`${greeting}${first ? `, ${first}` : ""}`}
        description={
          <>
            Operational overview for <span className="font-medium text-ink">{wh?.name}</span>
            {data && <span className="text-ink-subtle"> · updated {fmtTime(data.generatedAt)}</span>}
          </>
        }
        actions={
          <Button asChild>
            <Link href="/warehouse">
              <Boxes /> Open 3D warehouse
            </Link>
          </Button>
        }
      />

      {isError ? (
        <Card>
          <ErrorState message={error.message} onRetry={() => refetch()} />
        </Card>
      ) : (
        <div className="space-y-5">
          <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading || !data
              ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-[var(--radius-card)]" />)
              : data.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="overflow-hidden xl:col-span-2">
              <CardHeader
                title="Live warehouse"
                description="Interactive preview — open the 3D view to inspect and manage objects"
                icon={<Boxes />}
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/warehouse">
                      <Maximize2 /> Full view
                    </Link>
                  </Button>
                }
              />
              <div className="h-[380px] border-t border-line">
                <WarehousePreview />
              </div>
            </Card>
            <div className="flex flex-col gap-5">
              {data ? <CriticalAlerts items={data.alerts} /> : <Skeleton className="h-56 rounded-[var(--radius-card)]" />}
              {data ? <ZoneOccupancy zones={data.zones} /> : <Skeleton className="h-56 rounded-[var(--radius-card)]" />}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Operational performance" description="Seeded demo history plus today's live simulation" />
              <CardBody>{data ? <PerformanceChart data={data.performance} /> : <Skeleton className="h-[280px]" />}</CardBody>
            </Card>
            {data ? <ActivityFeed items={data.activity} /> : <Skeleton className="h-80 rounded-[var(--radius-card)]" />}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">{data ? <ActiveShipments items={data.shipments} /> : <Skeleton className="h-72 rounded-[var(--radius-card)]" />}</div>
            {data ? <PendingOrders items={data.pendingOrders} /> : <Skeleton className="h-72 rounded-[var(--radius-card)]" />}
          </div>
        </div>
      )}
    </div>
  );
}
