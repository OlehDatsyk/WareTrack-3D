# Using WareTrack 3D

A practical guide to operating the warehouse. Each screen below names the role it needs. Controls you can't use are hidden.

## 1. Signing in
Open the app and sign in. In demo mode, the sign-in page lists the four demo accounts. New self-registered accounts start as **Viewer**, and an administrator can upgrade them under **Settings → Users**.

## 2. The top bar
- **Search (Ctrl/⌘ + K)** finds products, pallets, orders, tracking numbers, vehicles and people. Selecting a pallet opens it in the 3D view.
- **Warehouse selector** switches between Riverside Hub (WH-01) and Northgate DC (WH-02). Every page follows the selected warehouse.
- **Live pill** shows whether the demo simulation is running. Managers can pause or resume it here.
- **Bell** shows unread alerts. **?** opens shortcuts and help.

## 3. 3D Warehouse
| Control | Action |
| --- | --- |
| Left-drag | Rotate |
| Right-drag / Shift-drag | Pan |
| Scroll | Zoom |
| `R` | Reset camera |
| `T` | Toggle top-down view |
| `Esc` | Clear selection |

The left toolbar zooms, resets, switches between top-down and isometric views, and toggles the roof (exterior/cut-away), the zone overlay and labels.

**Click any object** to open the inspector:
- **Pallet:** product, SKU, quantity, weight, location, lot and recent movements.
  - **Move pallet:** choose a zone and a free slot, then either create a *forklift task* (a forklift drives it there when the simulation runs, or you complete it manually) or *move now*.
  - **Damage:** records damaged units and optionally moves them to the Damaged Goods zone.
- **Rack:** capacity, occupied and available positions, a clickable slot map and stored products.
- **Forklift:** battery level, operator, current task. Actions: **Assign task**, **Charge**, **Maintenance / Return to service**.
- **Truck:** status and current shipment.
- **Dock:** current trailer and loading progress. Actions: **Assign shipment** (choose a planned shipment and a truck), **Maintenance / Reopen**.
- **Zone:** occupancy, stock, operations and temperature. Action: **Change status** (Active, Restricted, Maintenance, Closed). Closed or maintenance zones cannot receive stock.

The crosshair button in the inspector moves the camera to the selected object. The bottom panels list docks, forklifts and trucks, and clicking a row selects and focuses that object.

## 4. Inventory
- Filter by category or stock level (in stock, low, out). Sort any column, search by SKU, name or barcode, and export the current view to CSV.
- Click a product to see stock by zone, pallets, movement history and open order demand.
- **Adjust** corrects stock with a reason (cycle counts). You cannot go below reserved stock.
- **Transfer** moves loose units between zones. To move a whole pallet, use the 3D view.
- **Damage** records damaged units.
- **Delete** removes products with no history. Products with history are *archived* instead.

## 5. Orders
Create an order, then advance it:
1. **Release for processing** reserves stock. If stock is short, the order is refused and the shortage is listed.
2. **Start picking** creates a pick task.
3. **Mark picked** consumes stock (or completes the open pick task).
4. **Mark packed** stages a pallet in Dispatch.
5. Assign the order to an outbound shipment. It becomes **Dispatched** when the shipment departs and **Delivered** when the shipment is delivered.

**Cancel** releases reservations, returns picked units and cancels open tasks.

## 6. Shipments
The map shows vehicles on the road as **simulated route progress (not GPS)**. Open a shipment to assign a truck and driver, assign a dock, and move it through *At dock → Loading → Loading complete → Depart → Delivered*. You can also report a delay or cancel. Inbound shipments use the same flow, with *Unloading* and *Received*.

## 7. Fleet
Filter by status and switch between warehouse vehicles and trucks/vans. Open a vehicle to see battery or fuel level, maintenance history and tasks. Actions are edit, set status, log maintenance (*In progress* takes it out of service, *Completed* returns it), assign task, charge, remove, and **Show in 3D**.

## 8. Workforce
The directory shows shift and availability summaries. Profiles show aggregate performance (tasks, rate, accuracy). Only aggregate task metrics are recorded, never locations or individual monitoring. Managers can add, edit or remove employees and change availability. Operators and above can **assign an on-shift employee to a pending task**.

## 9. Zones
The floor plan and zone cards show occupancy. Zones can be created (with optional floor slots), edited, given a new status, or deleted (only when empty), and each zone links to the 3D view.

## 10. Analytics
Choose a range (7–180 days) plus a category and operation type. Charts marked **DEMO HISTORY** come from seeded history plus today's simulation. Charts marked **RECORDED DATA** are computed from actual stock movements and shipments in the database. **Export CSV** downloads the daily series.

## 11. Alerts & notifications
Filter by status, category and priority, mark items read or unread, or mark all read. The **Activity log** tab separates user actions from simulated events. Mute categories under **Settings → Preferences**.

## 12. Settings
- **Profile:** update your profile and password.
- **Preferences:** default warehouse and notification mutes.
- **Warehouse** (managers): name, hours, capacity alert threshold, dock slot length, and the simulation on/off switch and tick interval.
- **Users** (admins): invite users and change roles. Changing a role signs that user out.
- **Roles & permissions:** shows the full permission matrix.
- **Audit log:** lists every data-changing and security event.

## About the simulation
The simulation is deterministic: the same tick and database state always produce the same decisions. It uses the same services as people do, so stock, orders and shipments stay consistent. Everything it creates carries a **SIM** badge. Pause it at any time to work on a static warehouse.
