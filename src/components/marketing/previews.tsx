// Product-preview visuals for the public site. These are illustrative
// representations built from real product capabilities (fictional data),
// kept in one place so real screenshots can replace them later.
import type { ReactNode } from "react";
import { Download, Printer, Link2, Globe, EyeOff, Lock, ArrowRight, Database, GitCompare, FileCheck2, Search } from "lucide-react";

type Status = "draft" | "review" | "published" | "current" | "public" | "unlisted" | "private";
const CHIP: Record<Status, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-slate-soft text-muted-foreground", dot: "bg-muted-foreground" },
  review: { label: "In review", cls: "bg-amber-soft text-amber-ink", dot: "bg-amber" },
  published: { label: "Published", cls: "bg-teal-soft text-teal-ink", dot: "bg-teal" },
  current: { label: "Current", cls: "bg-teal-soft text-teal-ink", dot: "bg-teal" },
  public: { label: "Public", cls: "bg-blue-soft text-primary", dot: "bg-primary" },
  unlisted: { label: "Unlisted", cls: "bg-slate-soft text-ink", dot: "bg-muted-foreground" },
  private: { label: "Private", cls: "bg-slate-soft text-ink", dot: "bg-ink" },
};

export function StatusChip({ status, pulse = false, label }: { status: Status; pulse?: boolean; label?: string }) {
  const c = CHIP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot} ${pulse ? "status-pulse" : ""}`} aria-hidden />
      {label ?? c.label}
    </span>
  );
}

export function PreviewLabel({ children = "Product preview" }: { children?: ReactNode }) {
  return <span className="eyebrow rounded border border-dashed border-border bg-paper px-2 py-0.5 text-[0.68rem] text-muted-foreground">{children}</span>;
}

/** Decorative pseudo-QR. Not scannable. */
export function QrGlyph({ className = "h-14 w-14" }: { className?: string }) {
  const cells: ReactNode[] = [];
  let seed = 7;
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const finder = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
      seed = (seed * 9301 + 49297) % 233280;
      if (!finder && seed / 233280 > 0.55) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  const F = (x: number, y: number) => (
    <g key={`f${x}${y}`}><rect x={x} y={y} width="4" height="4" /><rect x={x + 1} y={y + 1} width="2" height="2" className="fill-card" /></g>
  );
  return (
    <svg viewBox="-1 -1 15 15" className={`${className} fill-ink`} aria-hidden>
      <rect x="-1" y="-1" width="15" height="15" className="fill-card" />
      {cells}{F(0, 0)}{F(9, 0)}{F(0, 9)}
    </svg>
  );
}

/** Hero: a published public manual with a "new version ready" overlay. */
export function HeroManualPreview() {
  const toc = ["Before you begin", "Unpack and check the parts", "Assemble the frame", "Fit the drawers", "Care and maintenance"];
  return (
    <div className="relative mx-auto w-full max-w-xl" role="img" aria-label="Product preview: a fictional published manual, version 2.4, with a table of contents, PDF download and QR code.">
      {/* back page edge */}
      <div className="absolute -right-3 -top-3 hidden h-full w-full rounded-2xl border border-border bg-paper-soft sm:block" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card page-shadow" aria-hidden>
        <div className="flex items-center justify-between gap-3 border-b border-border bg-paper-soft px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">manumanuals.com/m/northfield/workbench</span>
          </div>
          <PreviewLabel>Example manual</PreviewLabel>
        </div>
        <div className="grid gap-0 sm:grid-cols-[1fr_11rem]">
          <div className="p-6">
            <p className="eyebrow text-muted-foreground">Northfield Bench Co.</p>
            <h3 className="font-display mt-1 text-3xl font-medium text-ink">Two-Drawer Workbench</h3>
            <p className="mt-1 text-sm text-muted-foreground">Assembly &amp; care manual</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-ink">v2.4</span>
              <StatusChip status="published" pulse />
              <span className="text-xs text-muted-foreground">Updated today</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"><Download className="h-3.5 w-3.5" /> Download PDF</span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium text-ink"><Printer className="h-3.5 w-3.5" /> Print</span>
            </div>
            <div className="mt-6 space-y-2.5 border-t border-border pt-5">
              {[78, 92, 64].map((w, i) => (
                <div key={i} className="h-2 rounded-full bg-paper-soft" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
          <aside className="border-t border-border bg-paper/60 p-5 sm:border-l sm:border-t-0">
            <p className="eyebrow text-muted-foreground">Contents</p>
            <ol className="mt-3 space-y-2 text-xs text-ink">
              {toc.map((t, i) => (
                <li key={t} className={`flex gap-2 ${i === 2 ? "font-semibold text-primary" : ""}`}>
                  <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>{t}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex items-center gap-2">
              <QrGlyph className="h-12 w-12 rounded border border-border" />
              <span className="text-[0.68rem] leading-tight text-muted-foreground">Scan for the current version</span>
            </div>
          </aside>
        </div>
      </div>
      {/* overlay card */}
      <div className="rise relative -mt-10 ml-auto mr-2 w-[17.5rem] rounded-xl border border-border bg-card p-4 page-shadow sm:absolute sm:-bottom-10 sm:-left-8 sm:mt-0 sm:ml-0" aria-hidden>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">New version ready</p>
          <span className="font-mono text-xs text-muted-foreground">v2.5</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[0.7rem]">
          <StatusChip status="draft" /><ArrowRight className="h-3 w-3 text-muted-foreground" />
          <StatusChip status="review" /><ArrowRight className="h-3 w-3 text-muted-foreground" />
          <StatusChip status="published" />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Your stable link stays the same</p>
      </div>
    </div>
  );
}

/** Draft → Review → Publish lifecycle strip. */
export function LifecycleVisual({ compact = false }: { compact?: boolean }) {
  const rows: Array<[Status, string, string]> = [
    ["draft", "v2.5", "Edits in progress — only your team sees them"],
    ["review", "v2.5", "Checked before it goes live"],
    ["published", "v2.5", "Now served at the same link"],
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-4" aria-hidden>
      <ul className="space-y-2.5">
        {rows.map(([s, v, t]) => (
          <li key={s} className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">{v}</span>
            <StatusChip status={s} />
            {!compact && <span className="truncate text-xs text-muted-foreground">{t}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">v2.4 → superseded · kept in version history</p>
    </div>
  );
}

/** Public indexed / Unlisted / Private. */
export function VisibilityVisual() {
  const items = [
    { icon: Globe, status: "public" as Status, title: "Public", body: "Anyone can find and open it. Search engines may index it." },
    { icon: EyeOff, status: "unlisted" as Status, title: "Unlisted", body: "Anyone with the link can open it. Not indexed." },
    { icon: Lock, status: "private" as Status, title: "Private", body: "Only signed-in members of your team. No public link." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(({ icon: I, status, title, body }) => (
        <div key={title} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <I className="h-4 w-4 text-ink" aria-hidden />
            <StatusChip status={status} />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

/** Print / PDF page stack. */
export function PdfVisual() {
  return (
    <div className="relative mx-auto h-44 w-36" aria-hidden>
      <div className="absolute left-4 top-0 h-40 w-32 rotate-3 rounded-md border border-border bg-paper-soft" />
      <div className="absolute left-0 top-2 h-40 w-32 rounded-md border border-border bg-card p-3 page-shadow">
        <div className="h-1.5 w-16 rounded bg-ink/70" />
        <div className="mt-2 h-1 w-20 rounded bg-paper-soft" />
        <div className="mt-3 h-12 rounded bg-blue-soft" />
        {[90, 70, 80, 60].map((w, i) => <div key={i} className="mt-1.5 h-1 rounded bg-paper-soft" style={{ width: `${w}%` }} />)}
        <span className="absolute bottom-2 right-2 rounded bg-ink px-1.5 py-0.5 text-[0.55rem] font-semibold text-paper">PDF</span>
      </div>
    </div>
  );
}

/** Operations: Odoo product/BOM → change detected → review → published. */
export function OdooFlowVisual() {
  const steps = [
    { icon: Database, title: "Odoo product & BOM", sub: "Snapshot imported" },
    { icon: GitCompare, title: "Change detected", sub: "Component revised", tone: "amber" },
    { icon: Search, title: "Manual review", sub: "Flagged for your team" },
    { icon: FileCheck2, title: "Updated version", sub: "Published, same link", tone: "teal" },
  ];
  return (
    <ol className="grid gap-3 md:grid-cols-4" aria-label="Operations workflow">
      {steps.map(({ icon: I, title, sub, tone }, i) => (
        <li key={title} className="relative rounded-xl border border-paper/15 bg-paper/5 p-4">
          <I className={`h-5 w-5 ${tone === "amber" ? "text-amber" : tone === "teal" ? "text-teal" : "text-paper"}`} aria-hidden />
          <p className="mt-3 text-sm font-semibold text-paper">{title}</p>
          <p className="mt-0.5 text-xs text-paper/70">{sub}</p>
          {i < steps.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-paper/50 md:block" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Small typed document thumbnail for use cases / sample gallery. */
export function DocThumb({ accent = "blue", lines = 4 }: { accent?: "blue" | "teal" | "amber" | "slate"; lines?: number }) {
  const band = { blue: "bg-blue-soft", teal: "bg-teal-soft", amber: "bg-amber-soft", slate: "bg-slate-soft" }[accent];
  return (
    <div className="relative h-24 w-20 shrink-0" aria-hidden>
      <div className="absolute left-2 top-1 h-22 w-18 rounded-md border border-border bg-paper-soft" />
      <div className="absolute left-0 top-0 h-22 w-18 overflow-hidden rounded-md border border-border bg-card [clip-path:polygon(0_0,78%_0,100%_18%,100%_100%,0_100%)]">
        <div className={`h-6 ${band}`} />
        <div className="space-y-1.5 p-2">
          {Array.from({ length: lines }).map((_, i) => <div key={i} className="h-1 rounded bg-paper-soft" style={{ width: `${90 - i * 12}%` }} />)}
        </div>
      </div>
    </div>
  );
}

/** Decorative folded page-corner accent for section backgrounds. */
export function PageCorner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <path d="M0 0h84l36 36v84H0z" className="fill-blue-soft" />
      <path d="M84 0v28a8 8 0 0 0 8 8h28z" className="fill-primary/25" />
    </svg>
  );
}
