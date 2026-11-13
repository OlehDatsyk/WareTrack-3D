import { Boxes, Forklift, ShieldCheck, Truck } from "lucide-react";
import { Logo } from "@/components/layout/logo";

const FEATURES = [
  { icon: Boxes, title: "Interactive 3D warehouse", text: "Inspect racks, pallets, docks and vehicles in a live isometric view." },
  { icon: Forklift, title: "Fleet & workforce", text: "Assign forklifts, trucks and people to the work that matters now." },
  { icon: Truck, title: "Orders to delivery", text: "Follow every order from picking to proof of delivery." },
  { icon: ShieldCheck, title: "Role-based access", text: "Administrator, manager, operator and viewer permissions." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-900 p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(30deg,#fff_1px,transparent_1px),linear-gradient(150deg,#fff_1px,transparent_1px)] [background-size:44px_76px]" />
        <div className="absolute -right-24 -bottom-24 size-[520px] rounded-full bg-brand-600/40 blur-3xl" />
        <div className="relative">
          <div className="inline-flex rounded-xl bg-white p-2 pr-3">
            <Logo />
          </div>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-[34px] leading-[1.15] font-semibold tracking-tight">
            Run your warehouse like a strategy game.
            <span className="text-brand-300"> With enterprise-grade control.</span>
          </h1>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-[18px] text-brand-200" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[13px] text-brand-100/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-10 text-xs text-brand-100/60">All companies, people and products in this demo are fictional.</p>
        </div>
      </aside>
      <main className="flex items-center justify-center bg-surface px-5 py-10">{children}</main>
    </div>
  );
}
