// Invite-only onboarding. Admins create invites; invited users redeem via token at /auth.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Generate a URL-safe random token (32 bytes → 43 base64url chars)
function generateToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["owner", "admin", "editor", "viewer"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Role check via RLS-aware query
    const { data: isAdmin } = await supabase.rpc("has_org_any_role", {
      _org_id: data.organizationId,
      _roles: ["owner", "admin"],
    });
    if (!isAdmin) throw new Error("Forbidden: admin role required");

    const token = generateToken();
    const token_hash = await sha256Hex(token);
    const { error } = await supabase.from("invitations").insert({
      organization_id: data.organizationId,
      email: data.email.toLowerCase(),
      role: data.role,
      token_hash,
      invited_by: userId,
    });
    if (error) throw error;
    return { token }; // returned ONCE to admin; they share the link manually
  });

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("invitations")
      .select("id, email, role, expires_at, accepted_at, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

// Accept an invitation. Uses admin client to create the auth user (signup disabled globally).
export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(10),
        password: z.string().min(8),
        fullName: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const token_hash = await sha256Hex(data.token);
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("token_hash", token_hash)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invite) throw new Error("Invalid or expired invitation");
    if (invite.accepted_at) throw new Error("Invitation already used");
    if (new Date(invite.expires_at) < new Date())
      throw new Error("Invitation expired");

    // Create or find the auth user
    let userId: string | null = null;
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: invite.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
    if (createErr) {
      // user may already exist — try lookup
      const { data: list } = await supabaseAdmin.auth.admin.listUsers();
      const existing = list.users.find(
        (u) => u.email?.toLowerCase() === invite.email.toLowerCase(),
      );
      if (!existing) throw createErr;
      userId = existing.id;
      // update password
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.password,
      });
    } else {
      userId = created.user!.id;
    }

    // Add membership + role
    await supabaseAdmin
      .from("memberships")
      .insert({
        organization_id: invite.organization_id,
        user_id: userId!,
      })
      .then(() => null);
    await supabaseAdmin
      .from("org_roles")
      .insert({
        organization_id: invite.organization_id,
        user_id: userId!,
        role: invite.role,
      })
      .then(() => null);

    // Mark invitation accepted
    await supabaseAdmin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
      .eq("id", invite.id);

    return { ok: true, email: invite.email };
  });
