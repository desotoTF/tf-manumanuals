// Org-scoped reusable tool library. Used by the manual editor's Tools
// combobox: typing filters; "+ Add" upserts a new row case-insensitively
// (returns the existing row when the name already exists).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const uuid = z.string().uuid();

export interface ToolRow {
  id: string;
  organization_id: string;
  name: string;
  spec: string | null;
  created_at: string;
  updated_at: string;
}

export const listTools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tools")
      .select("id, organization_id, name, spec, created_at, updated_at")
      .eq("organization_id", data.organizationId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as ToolRow[];
  });

export const upsertTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        name: z.string().min(1).max(120),
        spec: z.string().max(500).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trimmed = data.name.trim();
    // Case-insensitive dedupe via the CITEXT unique index.
    const { data: existing } = await supabase
      .from("tools")
      .select("id, name, spec")
      .eq("organization_id", data.organizationId)
      .ilike("name", trimmed)
      .maybeSingle();
    if (existing) return existing as { id: string; name: string; spec: string | null };

    const { data: row, error } = await supabase
      .from("tools")
      .insert({
        organization_id: data.organizationId,
        name: trimmed,
        spec: data.spec ?? null,
        created_by: userId,
      })
      .select("id, name, spec")
      .single();
    if (error) throw error;
    return row as { id: string; name: string; spec: string | null };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tools")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
