# CLAUDE.md — WareTrack 3D

Guidance for AI agents and contributors. Keep this file current as the architecture evolves.

> **Next.js 16 note:** this project uses Next.js 16 (`proxy.ts`, Cache Components, Partial Prefetching). APIs differ from older versions. Read `node_modules/next/dist/docs/` before changing framework-level code (see `AGENTS.md`).

## Commands

```bash
docker compose up -d        # local Postgres on :5433 (+ waretrack_test)
npm run dev                 # dev server :3000
npm run check               # typecheck + lint + tests (run before finishing any change)
npm run build               # production build (also type-checks tests)
npm run db:migrate          # new migration after editing prisma/schema.prisma
npx prisma generate         # Prisma 7 does NOT auto-generate after migrate
npm run db:seed             # wipe + reseed demo data
```

## Architecture

```
src/
  app/
    (auth)/            login, register (public)
    (app)/             authenticated pages; layout = AppShell (client)
    api/**/route.ts    REST route handlers — thin wrappers only
  proxy.ts             optimistic redirect to /login when no session cookie
  components/
    ui/                design-system primitives (Radix + Tailwind tokens)
    layout/            sidebar, topbar, global search, notifications, help
    three/             React Three Fiber scene (procedural models)
    warehouse/         3D page overlays, inspector and action dialogs
    <module>/          page components per module
  server/
    api/handler.ts     route() wrapper: session → permission → zod → error mapping
    auth/              password hashing, sessions, rate limiting, cookies
    services/          ALL business logic (testable, take a Db/Tx client)
    simulation/        deterministic demo simulation engine
    seed/              demo data generator (used by prisma seed + tests)
    audit.ts           audit log, activity feed, notifications helpers
  lib/                 shared client/server utilities (permissions, workflows, geometry, rng, format, status maps)
  schemas/             zod schemas shared by forms and API
  stores/              zustand (app prefs, 3D scene selection/camera)
  generated/prisma/    generated client (git-ignored)
prisma/                schema, migrations, seed entry
tests/unit|integration Vitest
```

### Request flow
`Client (TanStack Query, src/lib/query.ts)` → `/api/...` with header `x-warehouse-id` → `route({ permission }, handler)` validates the session cookie and permission → service function in `src/server/services` → Prisma. Errors are thrown as `AppError` (`src/server/errors.ts`) and mapped to JSON `{ error: { code, message } }`. Success responses are `{ data }`.

### Key rules
- **Business logic lives in services**, never in route files or components. Services take the Prisma client or a transaction (`Tx`) so they compose atomically and can be tested directly.
- **Every mutating service writes `audit()`**, and most also write `logActivity()` for the operations feed.
- **Permissions**: add new ones to `src/lib/permissions.ts`, then enforce them in the route. The UI uses `useCan()` only to hide controls.
- **Stock accounting** (`src/server/services/stock.ts`): `InventoryItem.quantity` holds good units per zone, `reserved` is a subset of `quantity`, and `damaged` is tracked separately. Pallets in DISPATCH/PACKING zones are outbound and are not on-hand stock. Always move stock with `transferPalletStock` / `adjustZoneStock` / `consumeStock` / `reserveStock`.
- **Pallet moves** go through `movePallet()` (validates occupancy, weight, zone status and competing tasks).
- **Task lifecycle** goes through `createTask` / `startTask` / `completeTask` / `cancelTask` in `operations.ts`. `completeTask` applies the side effects (move pallet, consume stock for picks, load onto a shipment).
- **Workflows**: allowed order and shipment transitions are defined in `src/lib/workflows.ts` and enforced in the services.
- **Document numbers** (TSK-, SO-, SHP-, PAL-) come from Postgres sequences via `nextNumber()`. Never compute max+1.
- Inside interactive transactions, run queries **sequentially** (no `Promise.all` on `tx`).

### 3D scene (`src/components/three`)
- `/api/scene` (`services/scene.ts`) returns layout, zones, racks, pallets, docks and vehicles. For forklifts with an active task it also returns a **pre-planned route** (`planRoute`) and `pickupT`. The client only samples the path with `samplePath`, so animation is deterministic and cheap.
- Repeated geometry is **instanced** (racks, pallets, cargo boxes, trees, cars, ground marks). Pallet instance buffers are sized in steps of 512 to avoid remounts.
- Labels use a single DOM overlay (`labels.tsx`) projected every frame. **Do not use drei `<Html>`**, which creates one React root per label and is unstable with React 19.
- Selection and hover live in `useSceneStore`. `selectionBounds()` computes outlines, the pin and the camera focus target.
- Layout coordinates are in metres, centred on the building, and stored in the DB (`Zone.x/z/width/depth`, `Rack.posX/posZ`, `StorageLocation.posX/Y/Z`, `Warehouse.settings.layout`). Presets live in `src/lib/layout/presets.ts`.

### Simulation (`src/server/simulation/engine.ts`)
- Lazy and deterministic: `GET /api/simulation` (polled by the top bar) runs **at most one tick** when the interval has elapsed. An optimistic lock on `SimulationState.tick` de-duplicates concurrent pollers.
- Each step runs in its own transaction, with an RNG seeded from `(seed, tick, step)`.
- Everything it creates has `simulated = true` and shows a SIM badge.
- Pause or resume: managers use the top-bar pill or Settings → Warehouse.

### Client conventions
- Data fetching: `useApiQuery(key, path, query)` adds the warehouse to the key. Mutations use `useApiMutation({ path, invalidate, success })`.
- After a simulation tick, `useSimulationHeartbeat` invalidates the `scene`, `dashboard`, `orders` and other live keys.
- Avoid `setState` in effects (React Compiler lint). Use `usePage(filterKey)` for pagination resets, keyed remounts for forms, and `useNow()` for time (it returns 0 during prerender).
- Design tokens live in `src/app/globals.css` (`--color-brand-*`, `ink`, `line`, `surface`…). Use the `cn()` helper and `components/ui/*`.
- Charts follow the validated palette in `src/lib/chart-theme.ts`: fixed slot order, one axis per chart, and a legend for 2+ series.

## Testing
- `npm test` needs `TEST_DATABASE_URL`. Global setup migrates it, and each integration file reseeds it (`resetDatabase()`).
- Route handlers are tested by calling exported handlers with `NextRequest` (see `tests/helpers.ts`).
- Add tests for every new service behaviour, especially stock and workflow side effects.

## Security checklist for changes
- Validate all input with zod in the route. Never trust client-side permission checks.
- Never log secrets or return raw errors. Use `AppError` for user-facing messages.
- Keep `.env` out of git. Update `.env.example` when adding variables.
