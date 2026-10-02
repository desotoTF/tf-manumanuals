// Compact, dismissible getting-started progress shown above the manual library.
// Collapses by default once the first manual is published.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OnboardingChecklist({ orgId, hasManual, hasPublished }: { orgId: string; hasManual: boolean; hasPublished: boolean }) {
  const key = `mm_onboarding_dismissed_${orgId}`;
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(!hasPublished);
  useEffect(() => setHidden(!!localStorage.getItem(key)), [key]);
  useEffect(() => setOpen(!hasPublished), [hasPublished]);
  if (hidden) return null;

  const steps: Array<{ done: boolean; label: string; to: "/products" | "/settings/organization" | "/settings/team"; optional?: boolean }> = [
    { done: hasManual, label: "Create a manual", to: "/products" },
    { done: hasPublished, label: "Review and publish it", to: "/products" },
    { done: false, label: "Share a link or QR code", to: "/products" },
    { done: false, label: "Set your organization's public name", to: "/settings/organization" },
    { done: false, label: "Invite a teammate", to: "/settings/team", optional: true },
  ];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 text-left text-sm"
        >
          <span className="font-medium text-ink">Getting started</span>
          <span className="text-muted-foreground">· {done} of {required.length} complete</span>
          <span className="ml-2 hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
            <span className="block h-full bg-teal" style={{ width: `${(done / required.length) * 100}%` }} />
          </span>
          <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Dismiss getting started"
          onClick={() => { localStorage.setItem(key, "1"); setHidden(true); }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <ul className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {steps.map((s) => (
            <li key={s.label}>
              <Link
                to={s.to}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${s.done ? "border-teal/30 bg-teal-soft text-teal-ink" : "border-border text-ink hover:bg-accent"}`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />}
                {s.label}{s.optional ? " (optional)" : ""}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
