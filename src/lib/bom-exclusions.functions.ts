// Per-organization BOM-line exclusion list. Lines whose part_number matches
// any active rule are dropped from the manual-editor autofill (and the
// `.x` hardware-kit split too).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { BomExclusion, BomExclusionMatchType } from "@/lib/types";

const uuid = z.string().uuid();
const matchSchema = z.enum(["exact", "prefix", "suffix", "contains"]);

const SEED_PATTERNS: { pattern: string; match_type: BomExclusionMatchType }[] = [
  { pattern: "TF-Instruct", match_type: "exact" },
  { pattern: "TF000001-01", match_type: "exact" },
  { pattern: "TF041401 PK", match_type: "exact" },
];

async function ensureSeeds(
  supabase: { from: (t: "bom_exclusions") => any },
  orgId: string,
  userId: string,
) {
  const rows = SEED_PATTERNS.map((s) => ({
    organization_id: orgId,
    pattern: s.pattern,
    match_type: s.match_type,
    is_seed: true,
    note: "Default exclusion",
    created_by: userId,
  }));
  // ON CONFLICT DO NOTHING via the unique index — supabase-js does upsert ignoreDuplicates.
  await supabase.from("bom_exclusions").upsert(rows, {
    onConflict: "organization_id,pattern,match_type",
    ignoreDuplicates: true,
  });
}

export const listExclusions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Idempotent seed on first hit for an org.
    const { count } = await supabase
      .from("bom_exclusions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", data.organizationId);
    if ((count ?? 0) === 0) {
      await ensureSeeds(supabase, data.organizationId, userId);
    }
    const { data: rows, error } = await supabase
      .from("bom_exclusions")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("is_seed", { ascending: false })
      .order("pattern", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as BomExclusion[];
  });

export const addExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        pattern: z.string().min(1).max(200),
        match_type: matchSchema,
        note: z.string().max(500).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("bom_exclusions")
      .insert({
        organization_id: data.organizationId,
        pattern: data.pattern.trim(),
        match_type: data.match_type,
        note: data.note ?? null,
        is_seed: false,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row as BomExclusion;
  });

export const removeExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bom_exclusions")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// Helper used by other server fns: in-memory match check.
export function isExcluded(
  partNumber: string,
  rules: Pick<BomExclusion, "pattern" | "match_type">[],
): boolean {
  const pn = partNumber.toLowerCase();
  return rules.some((r) => {
    const p = r.pattern.toLowerCase();
    switch (r.match_type) {
      case "exact":
        return pn === p;
      case "prefix":
        return pn.startsWith(p);
      case "suffix":
        return pn.endsWith(p);
      case "contains":
        return pn.includes(p);
      default:
        return false;
    }
  });
}
