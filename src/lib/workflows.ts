import type { OrderStatus, ShipmentStatus } from "@/generated/prisma/enums";

/** Allowed manual order status transitions. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PICKING", "PENDING", "CANCELLED"],
  PICKING: ["PACKING", "CANCELLED"],
  PACKING: ["READY_FOR_DISPATCH", "CANCELLED"],
  READY_FOR_DISPATCH: ["DISPATCHED", "PACKING"],
  DISPATCHED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ORDER_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PROCESSING: "Release for processing",
  PICKING: "Start picking",
  PACKING: "Mark picked",
  READY_FOR_DISPATCH: "Mark packed",
  DISPATCHED: "Mark dispatched",
  DELIVERED: "Confirm delivery",
  PENDING: "Return to pending",
  CANCELLED: "Cancel order",
};

/** Allowed manual shipment status transitions. */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  PLANNED: ["AT_DOCK", "IN_TRANSIT", "CANCELLED"],
  AT_DOCK: ["LOADING", "CANCELLED"],
  LOADING: ["READY", "CANCELLED"],
  READY: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELAYED", "DELIVERED"],
  DELAYED: ["IN_TRANSIT", "DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus) {
  return SHIPMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export const SHIPMENT_ACTION_LABEL: Partial<Record<ShipmentStatus, string>> = {
  AT_DOCK: "Mark at dock",
  LOADING: "Start loading",
  READY: "Loading complete",
  IN_TRANSIT: "Depart",
  DELAYED: "Report delay",
  DELIVERED: "Confirm delivered",
  CANCELLED: "Cancel shipment",
};
