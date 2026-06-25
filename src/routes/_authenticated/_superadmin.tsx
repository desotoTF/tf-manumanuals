// Pathless layout that gates /admin/* routes behind super_admin role.
// The check runs on the server (assertSuperAdmin throws 403 if not allowed),
// so RLS + server-side validation both enforce access.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { assertSuperAdmin } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated/_superadmin")({
  beforeLoad: async () => {
    try {
      await assertSuperAdmin();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
