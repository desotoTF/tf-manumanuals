import { createFileRoute, Link } from "@tanstack/react-router";
import { Factory, BookOpen, GitCompare, Database } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ManuManuals — InstallOps for manufacturing" },
      {
        name: "description",
        content:
          "Keep installation manuals in sync with live BOM data from your ERP. Detect changes, route for review, and republish from a single source of truth.",
      },
      { property: "og:title", content: "ManuManuals — InstallOps for manufacturing" },
      {
        property: "og:description",
        content:
          "Keep installation manuals in sync with live BOM data from your ERP.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Factory className="h-5 w-5 text-primary" />
            ManuManuals
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          InstallOps for the factory floor
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          The SKU and its BOM are the source of truth. When engineering updates a
          BOM, ManuManuals flags the affected installation manuals, routes them
          for review, and republishes the web + PDF docs your dealers depend on.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-20 md:grid-cols-3">
        <Feature
          icon={<Database className="h-5 w-5 text-primary" />}
          title="BOM-first"
          body="Sync products and BOM snapshots from Odoo (and other ERPs). Content-hash dedup so noise doesn't flood your queue."
        />
        <Feature
          icon={<GitCompare className="h-5 w-5 text-primary" />}
          title="Drift detection"
          body="When a BOM changes, every published manual tied to the old snapshot flips to out-of-sync — automatically."
        />
        <Feature
          icon={<BookOpen className="h-5 w-5 text-primary" />}
          title="Structured manuals"
          body="Tools, parts, ordered steps, warnings, torque specs, annotated images — versioned and reviewed before publish."
        />
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
