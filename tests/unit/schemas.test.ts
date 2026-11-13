import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/schemas/auth";
import { productSchema, transferSchema } from "@/schemas/inventory";
import { orderSchema } from "@/schemas/orders";
import { zoneSchema } from "@/schemas/operations";
import { warehouseSettingsSchema } from "@/schemas/admin";

describe("validation schemas", () => {
  it("validates login input", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("enforces password strength and confirmation on registration", () => {
    const base = { name: "Pat Doe", email: "pat@example.com" };
    expect(registerSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "alllowercase123", confirmPassword: "alllowercase123" }).success).toBe(false);
    const mismatch = registerSchema.safeParse({ ...base, password: "Strong#Pass1", confirmPassword: "Strong#Pass2" });
    expect(mismatch.success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "Strong#Pass1", confirmPassword: "Strong#Pass1" }).success).toBe(true);
  });

  it("validates products", () => {
    const ok = productSchema.safeParse({ sku: "TST-001", name: "Test", category: "Tools", unitWeightKg: "1.5", unitCost: "2", reorderLevel: "10", reorderQty: "20", barcode: "" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.barcode).toBeNull();
      expect(ok.data.unitWeightKg).toBe(1.5);
    }
    expect(productSchema.safeParse({ sku: "lower", name: "x", category: "Tools", unitWeightKg: 1, unitCost: 1, reorderLevel: 1, reorderQty: 1 }).success).toBe(false);
    expect(productSchema.safeParse({ sku: "TST-002", name: "Test", category: "Tools", unitWeightKg: -1, unitCost: 1, reorderLevel: 1, reorderQty: 1 }).success).toBe(false);
  });

  it("rejects transfers to the same zone", () => {
    expect(transferSchema.safeParse({ fromZoneId: "a", toZoneId: "a", quantity: 1 }).success).toBe(false);
  });

  it("rejects orders with duplicate products or no lines", () => {
    const when = new Date().toISOString();
    expect(orderSchema.safeParse({ customerId: "c", requiredDispatchAt: when, items: [] }).success).toBe(false);
    expect(
      orderSchema.safeParse({
        customerId: "c",
        requiredDispatchAt: when,
        items: [
          { productId: "p", quantity: 1 },
          { productId: "p", quantity: 2 },
        ],
      }).success,
    ).toBe(false);
  });

  it("treats a blank zone temperature as unset rather than 0 °C", () => {
    const r = zoneSchema.safeParse({ code: "TMP", name: "Temp", type: "YARD", x: 0, z: 0, width: 5, depth: 5, temperatureC: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.temperatureC).toBeNull();
  });

  it("bounds warehouse settings", () => {
    const base = { name: "WH", address: "1 Road", city: "Town", timezone: "UTC", capacityWarningPct: 90, dockSlotMinutes: 45, openTime: "06:00", closeTime: "22:00", simulationRunning: true, simulationIntervalSec: 4 };
    expect(warehouseSettingsSchema.safeParse(base).success).toBe(true);
    expect(warehouseSettingsSchema.safeParse({ ...base, capacityWarningPct: 120 }).success).toBe(false);
    expect(warehouseSettingsSchema.safeParse({ ...base, openTime: "6am" }).success).toBe(false);
  });
});
