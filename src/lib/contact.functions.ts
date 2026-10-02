// Public contact form: validated, honeypot-protected, rate-limited by a hashed
// client address. Messages are stored for the master-admin inbox; the support
// address never ships to the browser from here.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createHash } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const CONTACT_TOPICS = [
  ["product", "Product question"],
  ["support", "Technical support"],
  ["billing", "Billing"],
  ["feature", "Feature request"],
  ["enterprise", "Enterprise or migration"],
] as const;

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  organization: z.string().trim().max(160).optional().or(z.literal("")),
  topic: z.enum(["product", "support", "billing", "feature", "enterprise"]),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(0).optional().or(z.literal("")), // honeypot
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    // Honeypot filled → pretend success, store nothing.
    if (data.website) return { ok: true };
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const ipHash = createHash("sha256").update(`mm-contact:${ip}`).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("contact_messages" as never)
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) {
      throw new Error("Too many messages from your network. Please try again later or email us directly.");
    }
    const { error } = await supabaseAdmin.from("contact_messages" as never).insert({
      name: data.name,
      email: data.email,
      organization: data.organization || null,
      topic: data.topic,
      message: data.message,
      ip_hash: ipHash,
    } as never);
    if (error) throw new Error("Could not send your message. Please email us directly.");
    return { ok: true };
  });

export const adminListContactMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSa } = await context.supabase.rpc("is_super_admin");
    if (!isSa) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("contact_messages" as never)
      .select("id, name, email, organization, topic, message, handled, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string; name: string; email: string; organization: string | null;
      topic: string; message: string; handled: boolean; created_at: string;
    }>;
  });
