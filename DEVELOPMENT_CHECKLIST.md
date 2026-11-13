# Development checklist

Status as of 2026-11-13. ✅ means implemented **and** verified (tests, browser, or both).

## Phase 1 — Foundation
- ✅ Next.js 16 + TypeScript + Tailwind 4 project, design tokens, Inter font
- ✅ UI primitives (button, inputs, dialogs, sheets, tables, tabs, tooltips, badges…)
- ✅ App shell: collapsible sidebar with tooltips and badges, top bar (search, warehouse selector, live status, notifications, help, user menu), mobile drawer
- ✅ PostgreSQL schema (25 models) with relations, indexes, constraints and 3 migrations
- ✅ Deterministic seed: 2 warehouses, 1,358 locations, ~890 pallets, 57 products, 218 orders, 72 shipments, 24 vehicles, 51 employees, 180 days of metrics
- ✅ Auth: register/login/logout, bcrypt, DB sessions with hashed tokens, httpOnly cookies, rate limiting, `proxy.ts` redirect
- ✅ RBAC: 4 roles, 24 permissions enforced server-side on every route

## Phase 2 — Dashboard
- ✅ 8 KPI cards with previous-period comparison, % change and sparkline
- ✅ 3D preview, critical alerts, zone occupancy, performance chart, activity feed, active shipments, pending orders

## Phase 3 — 3D warehouse
- ✅ Procedural building (cut-away and exterior), docks with doors, levelers, lights and canopies, racks, shelving, instanced pallets and cargo, forklifts, box trucks, semis, vans, office, car park, containers, trees, roads and markings
- ✅ Camera: rotate, pan, zoom, reset, top-down, smooth focus, keyboard shortcuts
- ✅ Selection and hover outlines, pin, inspector for pallet, rack, vehicle, dock and zone
- ✅ Actions: move pallet (task or now), damage, assign task, charge, maintenance, assign shipment to dock, dock maintenance, zone status
- ✅ WebGL fallback, lazy-loaded canvas, adaptive DPR, single DOM label overlay

## Phase 4 — Core management
- ✅ Inventory: CRUD, archive, adjust, transfer, damage, filters, sorting, pagination, CSV export, low-stock alerts, history
- ✅ Orders: create, edit, workflow with stock effects, assign to shipment, cancel, drawer and timeline
- ✅ Shipments: plan, assign truck, driver and dock, status workflow, delay, timeline, schematic map
- ✅ Fleet: CRUD, status, maintenance log, charge, assign task, link to 3D

## Phase 5 — Advanced management
- ✅ Workforce: directory, profiles, shifts, availability, task assignment, CRUD
- ✅ Zones: floor plan, cards, CRUD, status, linked to 3D
- ✅ Analytics: 9 charts, filters, CSV export, demo vs recorded labelling
- ✅ Notifications: read/unread, categories, priorities, history, mute preferences, activity log
- ✅ Settings: profile, password, preferences, warehouse configuration, users and roles, permissions matrix, audit log

## Phase 6 — Simulation
- ✅ Deterministic tick engine (inbound, put-away, orders, picking, loading, departures, deliveries, returns, charging, alerts, metrics)
- ✅ Animated forklifts on pre-planned aisle routes with fork lift and carried pallets, truck arrival animation
- ✅ Pause/resume and interval control, SIM labelling everywhere

## Phase 7 — Quality
- ✅ `npm run typecheck`: clean
- ✅ `npm run lint`: 0 errors (warnings are React-Compiler notes about React Hook Form `watch()`)
- ✅ `npm test`: 64 tests across unit, auth, API permissions, inventory, orders/shipments, simulation and journey suites
- ✅ `npm run build`: production build succeeds, and `next start` was smoke-tested (health, auth redirect, login, APIs, 3D page)
- ✅ Security headers, input validation, safe error responses, audit logging

## Phase 8 — Production
- ✅ README, CLAUDE.md, INSTRUCTIONS.md, DEPLOYMENT.md, .env.example, .gitignore
- ✅ Dockerfile + .dockerignore, Render Blueprint, `/api/health`, seed-if-empty
- ⬜ Deploy to Render (needs your Render account and GitHub repository)

## Known limitations / next steps
- Browser end-to-end tests (Playwright) are not included. UI journeys were verified manually in the browser, and API-level journeys are automated.
- Sign-in rate limiting is in-memory (per instance).
- The simulation advances only while at least one signed-in client is open.
- Racks are axis-aligned (rotation is stored but presets use 0).
- Dark mode is not implemented. The design targets the light theme from the reference.
