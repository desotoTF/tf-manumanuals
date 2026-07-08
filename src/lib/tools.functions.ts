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

export const renameTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid,
        organizationId: uuid,
        name: z.string().min(1).max(120),
        spec: z.string().max(500).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const trimmed = data.name.trim();
    // Load the current name so we can rewrite existing manual versions.
    const { data: current, error: loadErr } = await supabase
      .from("tools")
      .select("id, name")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!current) throw new Error("Tool not found");

    const { error: upErr } = await supabase
      .from("tools")
      .update({ name: trimmed, spec: data.spec ?? null })
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (upErr) throw upErr;

    // Rewrite content.tools[].name across all manual_versions belonging to
    // this org where the old name appears. Manual content stores tools by
    // name (not id), so we do this in JS to keep it portable.
    if (current.name !== trimmed) {
      const { data: versions } = await supabase
        .from("manual_versions")
        .select("id, content, manuals!inner(organization_id)")
        .eq("manuals.organization_id", data.organizationId);
      for (const v of versions ?? []) {
        const content = (v as { content: Record<string, unknown> }).content;
        const tools = Array.isArray((content as { tools?: unknown }).tools)
          ? ((content as { tools: { name: string; spec?: string }[] }).tools)
          : null;
        if (!tools) continue;
        let changed = false;
        const nextTools = tools.map((t) => {
          if (t.name === current.name) {
            changed = true;
            return { ...t, name: trimmed };
          }
          return t;
        });
        if (changed) {
          await supabase
            .from("manual_versions")
            .update({ content: { ...content, tools: nextTools } })
            .eq("id", (v as { id: string }).id);
        }
      }
    }

    return { id: data.id, name: trimmed, spec: data.spec ?? null };
  });

export const countToolUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, organizationId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("tools")
      .select("name")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!row) return { count: 0 };
    const name = (row as { name: string }).name;
    const { data: versions } = await supabase
      .from("manual_versions")
      .select("id, content, manuals!inner(organization_id)")
      .eq("manuals.organization_id", data.organizationId);
    let count = 0;
    for (const v of versions ?? []) {
      const tools = (v as { content: { tools?: { name: string }[] } }).content
        ?.tools;
      if (Array.isArray(tools) && tools.some((t) => t.name === name)) count++;
    }
    return { count };
  });

export const deleteTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, organizationId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Block delete if any manual version still references this tool by name.
    const { data: row } = await supabase
      .from("tools")
      .select("name")
      .eq("id", data.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (!row) return { ok: true as const };
    const name = (row as { name: string }).name;
    const { data: versions } = await supabase
      .from("manual_versions")
      .select("id, content, manuals!inner(organization_id)")
      .eq("manuals.organization_id", data.organizationId);
    let count = 0;
    for (const v of versions ?? []) {
      const tools = (v as { content: { tools?: { name: string }[] } }).content
        ?.tools;
      if (Array.isArray(tools) && tools.some((t) => t.name === name)) count++;
    }
    if (count > 0) {
      throw new Error(
        `Cannot delete: this tool is used in ${count} manual version${count === 1 ? "" : "s"}. Remove it from those manuals first.`,
      );
    }
    const { error } = await supabase
      .from("tools")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return { ok: true as const };
  });
