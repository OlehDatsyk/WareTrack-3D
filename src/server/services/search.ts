import type { Db } from "@/server/db";

export type SearchHit = {
  type: "product" | "pallet" | "order" | "shipment" | "vehicle" | "employee";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function globalSearch(db: Db, warehouseId: string, raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };
  const take = 4;
  const [products, pallets, orders, shipments, vehicles, employees] = await Promise.all([
    db.product.findMany({
      where: { OR: [{ sku: contains }, { name: contains }, { barcode: contains }] },
      take,
      select: { id: true, sku: true, name: true, category: true },
    }),
    db.pallet.findMany({
      where: { warehouseId, OR: [{ code: contains }, { lot: contains }] },
      take,
      select: { id: true, code: true, product: { select: { name: true } }, location: { select: { code: true } } },
    }),
    db.order.findMany({
      where: { warehouseId, OR: [{ number: contains }, { customer: { name: contains } }] },
      take,
      select: { id: true, number: true, status: true, customer: { select: { name: true } } },
    }),
    db.shipment.findMany({
      where: { warehouseId, OR: [{ trackingNumber: contains }, { destination: contains }, { carrier: contains }] },
      take,
      select: { id: true, trackingNumber: true, destination: true, status: true },
    }),
    db.vehicle.findMany({
      where: { warehouseId, OR: [{ code: contains }, { model: contains }, { registration: contains }] },
      take,
      select: { id: true, code: true, model: true, status: true },
    }),
    db.employee.findMany({
      where: {
        warehouseId,
        OR: [{ firstName: contains }, { lastName: contains }, { employeeCode: contains }, { email: contains }],
      },
      take,
      select: { id: true, firstName: true, lastName: true, role: true, employeeCode: true },
    }),
  ]);
  const human = (s: string) => s.toLowerCase().replace(/_/g, " ");
  return [
    ...products.map((p) => ({
      type: "product" as const,
      id: p.id,
      title: `${p.name}`,
      subtitle: `${p.sku} · ${p.category}`,
      href: `/inventory?product=${p.id}`,
    })),
    ...pallets.map((p) => ({
      type: "pallet" as const,
      id: p.id,
      title: p.code,
      subtitle: `${p.product.name}${p.location ? ` · ${p.location.code}` : ""}`,
      href: `/warehouse?select=pallet:${p.id}`,
    })),
    ...orders.map((o) => ({
      type: "order" as const,
      id: o.id,
      title: o.number,
      subtitle: `${o.customer.name} · ${human(o.status)}`,
      href: `/orders?id=${o.id}`,
    })),
    ...shipments.map((s) => ({
      type: "shipment" as const,
      id: s.id,
      title: s.trackingNumber,
      subtitle: `${s.destination} · ${human(s.status)}`,
      href: `/shipments?id=${s.id}`,
    })),
    ...vehicles.map((v) => ({
      type: "vehicle" as const,
      id: v.id,
      title: v.code,
      subtitle: `${v.model} · ${human(v.status)}`,
      href: `/fleet?id=${v.id}`,
    })),
    ...employees.map((e) => ({
      type: "employee" as const,
      id: e.id,
      title: `${e.firstName} ${e.lastName}`,
      subtitle: `${e.employeeCode} · ${human(e.role)}`,
      href: `/workforce?id=${e.id}`,
    })),
  ];
}
