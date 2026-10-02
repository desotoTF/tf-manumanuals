// Password reset landing page (auth_ = not nested under /auth, so the sign-in
// page never renders or redirects here). Supabase redirects here from the recovery
// email with a session in "recovery" mode. We call updateUser({password}).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ManuMark } from "@/components/ManuMark";

export const Route = createFileRoute("/auth_/reset")({
  head: () => ({
    meta: [
      { title: "Reset password — ThumperFab" },
      { name: "description", content: "Choose a new password for your ThumperFab account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supports every recovery link format:
    //  - ?token_hash=…&type=recovery  (custom email templates, links straight here)
    //  - ?code=…                      (PKCE)
    //  - #access_token=…&type=recovery (implicit; parsed by the auth client)
    // Falls back to an existing session (set moments ago by the link).
    let cancelled = false;
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        try { sessionStorage.setItem("mm_recovery", "1"); } catch { /* ignore */ }
        setStatus("ready");
      }
    });
    (async () => {
      const qs = new URLSearchParams(window.location.search);
      const tokenHash = qs.get("token_hash");
      const code = qs.get("code");
      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        if (tokenHash || code) window.history.replaceState(null, "", "/auth/reset");
      } catch {
        try { sessionStorage.removeItem("mm_recovery"); } catch { /* ignore */ }
        if (!cancelled) setStatus("invalid");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) setStatus("ready");
      else setTimeout(() => setStatus((s) => (s === "checking" ? "invalid" : s)), 2000);
    })();
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    try { sessionStorage.removeItem("mm_recovery"); } catch { /* ignore */ }
    toast.success("Password updated. Signing you in…");
    navigate({ to: "/products" });
  };

  return (
    <div className="mm paper-grid flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <ManuMark className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "checking" && (
            <p className="text-sm text-muted-foreground">Verifying reset link…</p>
          )}
          {status === "invalid" && (
            <div className="space-y-3 text-sm">
              <p className="text-destructive">
                This reset link is invalid or has expired.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/auth" })}
              >
                Back to sign in
              </Button>
            </div>
          )}
          {status === "ready" && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
