import {
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  Forklift,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: "alerts" };

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operations",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/warehouse", label: "3D Warehouse", icon: Boxes },
      { href: "/inventory", label: "Inventory", icon: Package },
      { href: "/orders", label: "Orders", icon: ClipboardList },
      { href: "/shipments", label: "Shipments", icon: Truck },
    ],
  },
  {
    title: "Resources",
    items: [
      { href: "/fleet", label: "Fleet Management", icon: Forklift },
      { href: "/workforce", label: "Workforce", icon: Users },
      { href: "/zones", label: "Warehouse Zones", icon: LayoutGrid },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/alerts", label: "Alerts & Notifications", icon: Bell, badgeKey: "alerts" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Settings", icon: Settings };

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
