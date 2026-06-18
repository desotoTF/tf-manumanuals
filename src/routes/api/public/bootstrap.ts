// One-time admin bootstrap. Creates desotod@gmail.com as owner+admin of the demo org.
// Safe to call repeatedly; no-op once an owner exists.
import { createFileRoute } from "@tanstack/react-router";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_EMAIL = "desotod@gmail.com";

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      POST: async () => handle(),
      GET: async () => handle(),
    },
  },
});

async function handle() {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  // Already bootstrapped?
  const { data: existing } = await supabaseAdmin
    .from("org_roles")
    .select("user_id")
    .eq("organization_id", DEMO_ORG_ID)
    .eq("role", "owner")
    .maybeSingle();
  if (existing) {
    return Response.json({
      ok: true,
      status: "already_bootstrapped",
      message:
        "Admin already exists. Use the password you set, or reset via Cloud auth.",
    });
  }

  // Find or create the auth user
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  let user = list.users.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
  );
  const tempPassword = generatePassword();
  if (!user) {
    const { data: created, error } =
      await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: "ManuManuals Admin" },
      });
    if (error || !created?.user) {
      return Response.json(
        { ok: false, error: error?.message ?? "createUser failed" },
        { status: 500 },
      );
    }
    user = created.user;
  } else {
    // Existing user: rotate password so the caller always gets a usable credential.
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: tempPassword,
    });
  }

  await supabaseAdmin.from("memberships").insert({
    organization_id: DEMO_ORG_ID,
    user_id: user.id,
  });
  await supabaseAdmin.from("org_roles").insert([
    { organization_id: DEMO_ORG_ID, user_id: user.id, role: "owner" },
    { organization_id: DEMO_ORG_ID, user_id: user.id, role: "admin" },
  ]);

  return Response.json({
    ok: true,
    status: "bootstrapped",
    email: ADMIN_EMAIL,
    tempPassword,
    message:
      "Save this temporary password — it will not be shown again. Sign in at /auth and change it from your profile.",
  });
}

function generatePassword() {
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/[+/=]/g, "")
    .slice(0, 20);
}
