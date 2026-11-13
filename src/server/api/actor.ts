import type { RouteContext } from "./handler";

/** The authenticated user as an operation actor (for audit + activity attribution). */
export function actorOf<P>(ctx: RouteContext<P>) {
  return { userId: ctx.user.id, name: ctx.user.name, ip: ctx.ip, simulated: false };
}
