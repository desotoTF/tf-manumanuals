// One-time admin bootstrap. Idempotent.
// - Creates desotod@gmail.com as owner+admin of the demo org.
// - Creates rangerstatellc@gmail.com as platform super_admin AND owner+admin of the demo org.
// Each user is bootstrapped at most once; if already present, their org/role/platform-role
// rows are ensured but their password is rotated and returned so the caller has a usable credential.
import { createFileRoute } from "@tanstack/react-router";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

type Seed = {
  email: string;
  fullName: string;
  platformSuperAdmin: boolean;
};

const SEEDS: Seed[] = [
  { email: "desotod@gmail.com", fullName: "ManuManuals Admin", platformSuperAdmin: false },
  { email: "rangerstatellc@gmail.com", fullName: "ManuManuals Super Admin", platformSuperAdmin: true },
];

export const Route = createFileRoute("/api/public/bootstrap")({
  server: {
    handlers: {
      POST: async () => safeHandle(),
      GET: async () => safeHandle(),
    },
  },
});

async function safeHandle() {
  try {
    return await handle();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[bootstrap] failed:", message, stack);
    return Response.json(
      { ok: false, error: message, stack },
      { status: 500 },
    );
  }
}

async function handle() {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );

  const results: Array<{
    email: string;
    status: "created" | "rotated" | "ensured";
    tempPassword?: string;
    superAdmin: boolean;
  }> = [];

  // Find all existing users once
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();

  for (const seed of SEEDS) {
    let user = list?.users.find(
      (u) => u.email?.toLowerCase() === seed.email.toLowerCase(),
    );
    const tempPassword = generatePassword();

    if (!user) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: seed.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: seed.fullName },
      });
      if (error || !created?.user) {
        results.push({
          email: seed.email,
          status: "ensured",
          superAdmin: seed.platformSuperAdmin,
        });
        continue;
      }
      user = created.user;
      results.push({
        email: seed.email,
        status: "created",
        tempPassword,
        superAdmin: seed.platformSuperAdmin,
      });
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: tempPassword,
      });
      results.push({
        email: seed.email,
        status: "rotated",
        tempPassword,
        superAdmin: seed.platformSuperAdmin,
      });
    }

    // Ensure membership + org roles in demo org (idempotent)
    await supabaseAdmin
      .from("memberships")
      .upsert(
        { organization_id: DEMO_ORG_ID, user_id: user.id },
        { onConflict: "organization_id,user_id", ignoreDuplicates: true },
      );
    await supabaseAdmin
      .from("org_roles")
      .upsert(
        [
          { organization_id: DEMO_ORG_ID, user_id: user.id, role: "owner" },
          { organization_id: DEMO_ORG_ID, user_id: user.id, role: "admin" },
        ],
        { onConflict: "organization_id,user_id,role", ignoreDuplicates: true },
      );

    // Ensure platform role
    if (seed.platformSuperAdmin) {
      await supabaseAdmin
        .from("platform_roles")
        .upsert(
          { user_id: user.id, role: "super_admin" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
    }
  }

  return Response.json({
    ok: true,
    message:
      "Save any tempPassword values — they will not be shown again. Sign in at /auth and change them from your profile.",
    results,
  });
}

function generatePassword() {
  const buf = new Uint8Array(18);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/[+/=]/g, "")
    .slice(0, 20);
}
