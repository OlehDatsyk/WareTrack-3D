import type { BadgeTone } from "@/components/ui/badge";

type StatusDef = { label: string; tone: BadgeTone };

const def = (label: string, tone: BadgeTone): StatusDef => ({ label, tone });

export const ORDER_STATUS: Record<string, StatusDef> = {
  PENDING: def("Pending", "neutral"),
  PROCESSING: def("Processing", "info"),
  PICKING: def("Picking", "brand"),
  PACKING: def("Packing", "brand"),
  READY_FOR_DISPATCH: def("Ready for dispatch", "warning"),
  DISPATCHED: def("Dispatched", "info"),
  DELIVERED: def("Delivered", "success"),
  CANCELLED: def("Cancelled", "danger"),
};

export const ORDER_FLOW = [
  "PENDING",
  "PROCESSING",
  "PICKING",
  "PACKING",
  "READY_FOR_DISPATCH",
  "DISPATCHED",
  "DELIVERED",
] as const;

export const SHIPMENT_STATUS: Record<string, StatusDef> = {
  PLANNED: def("Planned", "neutral"),
  AT_DOCK: def("At dock", "info"),
  LOADING: def("Loading", "brand"),
  READY: def("Ready", "warning"),
  IN_TRANSIT: def("In transit", "info"),
  DELAYED: def("Delayed", "danger"),
  DELIVERED: def("Delivered", "success"),
  CANCELLED: def("Cancelled", "neutral"),
};

export function shipmentStatusLabel(status: string, direction: string) {
  if (direction === "INBOUND") {
    if (status === "LOADING") return "Unloading";
    if (status === "DELIVERED") return "Received";
    if (status === "IN_TRANSIT") return "En route";
  }
  return SHIPMENT_STATUS[status]?.label ?? status;
}

export const VEHICLE_STATUS: Record<string, StatusDef> = {
  AVAILABLE: def("Available", "success"),
  IN_USE: def("In use", "brand"),
  CHARGING: def("Charging", "warning"),
  MAINTENANCE: def("Maintenance", "danger"),
  OUT_OF_SERVICE: def("Out of service", "neutral"),
};

export const VEHICLE_TYPE: Record<string, string> = {
  FORKLIFT: "Forklift",
  REACH_TRUCK: "Reach truck",
  PALLET_JACK: "Pallet jack",
  TRUCK: "Truck",
  VAN: "Delivery van",
};

export const ZONE_STATUS: Record<string, StatusDef> = {
  ACTIVE: def("Active", "success"),
  RESTRICTED: def("Restricted", "warning"),
  MAINTENANCE: def("Maintenance", "danger"),
  CLOSED: def("Closed", "neutral"),
};

export const ZONE_TYPE: Record<string, string> = {
  RECEIVING: "Receiving",
  STORAGE: "Storage",
  PICKING: "Picking",
  PACKING: "Packing",
  DISPATCH: "Dispatch",
  RETURNS: "Returns",
  DAMAGED: "Damaged goods",
  YARD: "Yard",
};

export const PALLET_STATUS: Record<string, StatusDef> = {
  RECEIVED: def("Received", "info"),
  STORED: def("Stored", "success"),
  STAGED: def("Staged", "warning"),
  IN_TRANSIT: def("Moving", "brand"),
  LOADED: def("Loaded", "neutral"),
  DAMAGED: def("Damaged", "danger"),
};

export const TASK_STATUS: Record<string, StatusDef> = {
  PENDING: def("Pending", "neutral"),
  IN_PROGRESS: def("In progress", "brand"),
  COMPLETED: def("Completed", "success"),
  CANCELLED: def("Cancelled", "danger"),
};

export const TASK_TYPE: Record<string, string> = {
  PUTAWAY: "Put-away",
  PICK: "Pick",
  REPLENISH: "Replenish",
  TRANSFER: "Transfer",
  LOAD: "Load",
  UNLOAD: "Unload",
  CYCLE_COUNT: "Cycle count",
};

export const PRIORITY: Record<string, StatusDef> = {
  LOW: def("Low", "neutral"),
  NORMAL: def("Normal", "info"),
  HIGH: def("High", "warning"),
  URGENT: def("Urgent", "danger"),
};

export const EMPLOYEE_STATUS: Record<string, StatusDef> = {
  ON_SHIFT: def("On shift", "success"),
  ON_BREAK: def("On break", "warning"),
  OFF_SHIFT: def("Off shift", "neutral"),
  ON_LEAVE: def("On leave", "info"),
};

export const EMPLOYEE_ROLE: Record<string, string> = {
  SUPERVISOR: "Supervisor",
  FORKLIFT_OPERATOR: "Forklift operator",
  PICKER: "Picker",
  PACKER: "Packer",
  LOADER: "Loader",
  DRIVER: "Driver",
  INVENTORY_CLERK: "Inventory clerk",
};

export const SHIFT: Record<string, string> = {
  MORNING: "Morning · 06–14",
  AFTERNOON: "Afternoon · 14–22",
  NIGHT: "Night · 22–06",
};

export const NOTIFICATION_PRIORITY: Record<string, StatusDef> = {
  LOW: def("Low", "neutral"),
  MEDIUM: def("Medium", "info"),
  HIGH: def("High", "warning"),
  CRITICAL: def("Critical", "danger"),
};

export const NOTIFICATION_CATEGORY: Record<string, string> = {
  INVENTORY: "Inventory",
  ORDER: "Orders",
  SHIPMENT: "Shipments",
  FLEET: "Fleet",
  CAPACITY: "Capacity",
  WORKFORCE: "Workforce",
  SYSTEM: "System",
};

export const MOVEMENT_TYPE: Record<string, StatusDef> = {
  RECEIPT: def("Receipt", "success"),
  PUTAWAY: def("Put-away", "info"),
  TRANSFER: def("Transfer", "brand"),
  PICK: def("Pick", "neutral"),
  ADJUSTMENT: def("Adjustment", "warning"),
  DAMAGE: def("Damage", "danger"),
  RETURN: def("Return", "info"),
  DISPATCH: def("Dispatch", "neutral"),
};
