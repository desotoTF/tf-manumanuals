// Plan catalog + server-side feature assertion. Limits themselves are enforced
// in the database (triggers on manuals/memberships, org_has_feature RPC).
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanKey = "free" | "creator" | "team" | "operations" | "enterprise" | "legacy";
export type Feature =
  | "remove_branding"
  | "custom_branding"
  | "custom_templates"
  | "pdf_import"
  | "odoo"
  | "docsie";

export const PLANS: Array<{
  key: Exclude<PlanKey, "legacy">;
  name: string;
  monthly: number | null;
  yearly: number | null;
  blurb: string;
  manuals: string;
  seats: string;
  features: string[];
}> = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    blurb: "Start free with one complete manual.",
    manuals: "1 active manual",
    seats: "1 seat",
    features: [
      "Full editor & standard templates",
      "PDF preview and export",
      "One stable public link + QR code",
      "Public, unlisted, or private visibility",
      "Draft → publish versioning",
      "Clone manuals (each copy counts toward your limit)",
      "ThumperFab footer on outputs",
      "Help center and email support as available",
    ],
  },
  {
    key: "creator",
    name: "Creator",
    monthly: 12,
    yearly: 99,
    blurb: "For individuals and small businesses.",
    manuals: "10 active manuals",
    seats: "1 seat",
    features: ["Everything in Free", "Remove ThumperFab branding", "Logo, colors & contact info", "Email support"],
  },
  {
    key: "team",
    name: "Team",
    monthly: 29,
    yearly: 249,
    blurb: "For small teams sharing a manual library.",
    manuals: "50 active manuals",
    seats: "5 seats",
    features: ["Everything in Creator", "Shared org templates", "Existing-PDF import (AI-assisted)", "Email support, typically within 1 business day"],
  },
  {
    key: "operations",
    name: "Operations",
    monthly: 59,
    yearly: 499,
    blurb: "For product, service and operations teams.",
    manuals: "250 active manuals",
    seats: "15 seats",
    features: [
      "Everything in Team",
      "Odoo product & BOM import",
      "BOM snapshots & drift status",
      "Docsie video import (your own Docsie key)",
      "Priority email support, typically within 1 business day",
    ],
  },
];

export const FEATURE_MIN_PLAN: Record<Feature, string> = {
  remove_branding: "Creator",
  custom_branding: "Creator",
  custom_templates: "Team",
  pdf_import: "Team",
  odoo: "Operations",
  docsie: "Operations",
};

const FEATURE_LABEL: Record<Feature, string> = {
  remove_branding: "Removing ThumperFab branding",
  custom_branding: "Advanced branding",
  custom_templates: "Custom templates",
  pdf_import: "Importing an existing PDF",
  odoo: "The Odoo connection",
  docsie: "Docsie video import",
};

export async function assertFeature(
  supabase: SupabaseClient<any>,
  orgId: string,
  feature: Feature,
) {
  const { data, error } = await supabase.rpc("org_has_feature" as never, {
    _org_id: orgId,
    _feature: feature,
  } as never);
  if (error) throw error;
  if (!data) {
    throw new Error(
      `PLAN_LIMIT:${feature}:${FEATURE_LABEL[feature]} requires the ${FEATURE_MIN_PLAN[feature]} plan or higher.`,
    );
  }
}

/** Turn a "PLAN_LIMIT:key:message" error into a friendly message. */
export function planErrorMessage(err: unknown): { isPlanLimit: boolean; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/PLAN_LIMIT:[a-z_]+:(.+)$/);
  return m ? { isPlanLimit: true, message: m[1] } : { isPlanLimit: false, message: raw };
}
