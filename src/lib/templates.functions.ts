// Manual template CRUD. Templates are reusable manual skeletons (default
// section content + a layout preset) that authors pick from when starting a
// manual — whether from scratch or via legacy PDF import.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { emptyManualContent } from "@/lib/types";
// Recursive JSON type for template content (serializable across server fn).
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

const uuid = z.string().uuid();
const layoutSchema = z.enum([
  "classic",
  "compact",
  "field_guide",
  "service_card",
]);

const contentSchema = z.record(z.string(), z.unknown());

export interface TemplateRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  layout: "classic" | "compact" | "field_guide" | "service_card";
  is_default: boolean;
  is_master: boolean;
  default_content: JsonValue;
  branding: JsonValue;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS =
  "id, organization_id, name, description, layout, is_default, is_master, default_content, branding, created_at, updated_at";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("manual_templates" as never)
      .select(TEMPLATE_COLUMNS)
      .eq("organization_id", data.organizationId)
      .order("is_master", { ascending: false })
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw error;
    return JSON.parse(JSON.stringify(rows ?? [])) as TemplateRow[];
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("manual_templates" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Template not found");
    return JSON.parse(JSON.stringify(row)) as TemplateRow;
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: uuid.optional(),
        organizationId: uuid,
        name: z.string().min(1).max(120),
        description: z.string().max(2000).nullish(),
        layout: layoutSchema,
        defaultContent: contentSchema.optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const payload: Record<string, unknown> = {
      organization_id: data.organizationId,
      name: data.name,
      description: data.description ?? null,
      layout: data.layout,
      default_content: data.defaultContent ?? emptyManualContent(),
      is_default: data.isDefault ?? false,
    };

    // If marking default, clear the existing default first (partial unique
    // index would otherwise reject the second row).
    if (data.isDefault) {
      await supabase
        .from("manual_templates" as never)
        .update({ is_default: false } as never)
        .eq("organization_id", data.organizationId)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    if (data.id) {
      const { data: row, error } = await supabase
        .from("manual_templates" as never)
        .update(payload as never)
        .eq("id", data.id)
        .select("id")
        .single();
      if (error) throw error;
      return { id: (row as { id: string }).id };
    }

    const { data: row, error } = await supabase
      .from("manual_templates" as never)
      .insert({ ...payload, created_by: userId } as never)
      .select("id")
      .single();
    if (error) throw error;
    return { id: (row as { id: string }).id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_templates" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

export const setDefaultTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: uuid, organizationId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("manual_templates" as never)
      .update({ is_default: false } as never)
      .eq("organization_id", data.organizationId)
      .neq("id", data.id);
    const { error } = await supabase
      .from("manual_templates" as never)
      .update({ is_default: true } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });
