import { z } from "zod";
import { db } from "@/server/db";
import { route } from "@/server/api/handler";
import { maybeAdvance, setSimulationRunning } from "@/server/simulation/engine";
import { audit } from "@/server/audit";
import { logActivity } from "@/server/audit";

/** Returns simulation status; advances the demo simulation by one tick when due. */
export const GET = route({ permission: "dashboard:read" }, async ({ warehouseId }) => {
  const id = await warehouseId();
  const result = await maybeAdvance(db, id);
  const state = await db.simulationState.findUniqueOrThrow({ where: { warehouseId: id } });
  return {
    running: state.running,
    tick: state.tick,
    intervalMs: state.intervalMs,
    lastTickAt: state.lastTickAt,
    serverTime: new Date(),
    advanced: result.advanced,
    events: result.events,
  };
});

export const PATCH = route({ permission: "simulation:control" }, async ({ warehouseId, json, user, ip }) => {
  const { running } = await json(z.object({ running: z.boolean() }));
  const id = await warehouseId();
  const state = await setSimulationRunning(db, id, running);
  await audit(db, { userId: user.id, action: running ? "simulation.resume" : "simulation.pause", entityType: "Warehouse", entityId: id, ip });
  await logActivity(db, {
    warehouseId: id,
    type: "simulation.control",
    message: `Simulation ${running ? "resumed" : "paused"} by ${user.name}`,
    actorName: user.name,
  });
  return { running: state.running, tick: state.tick };
});
