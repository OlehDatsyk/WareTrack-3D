"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SimBadge } from "@/components/ui/badge";

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + K", "Open global search"],
  ["Esc", "Close panels and clear 3D selection"],
  ["R", "Reset the 3D camera (3D view)"],
  ["T", "Toggle top-down view (3D view)"],
  ["Left-drag", "Rotate camera"],
  ["Right-drag / Shift-drag", "Pan camera"],
  ["Scroll", "Zoom"],
];

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Help & shortcuts" description="Getting around WareTrack 3D." className="max-w-xl">
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 font-semibold">Keyboard & mouse</h3>
            <dl className="divide-y divide-line rounded-lg border border-line">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-3 py-2">
                  <dt>
                    <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-xs font-semibold">{k}</kbd>
                  </dt>
                  <dd className="text-ink-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Demo data & simulation</h3>
            <p className="text-ink-muted">
              This workspace runs on fictional demo data. A deterministic simulation moves forklifts, docks trucks and
              progresses orders so the warehouse feels alive. Anything it creates is tagged <SimBadge className="mx-0.5" />.
              Changes you make yourself are real database writes and are recorded in the audit log. Managers can pause the
              simulation from the status pill in the top bar.
            </p>
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Vehicle positions</h3>
            <p className="text-ink-muted">
              Route maps show schematic, simulated progress. No live GPS integration is configured.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
