// Sign-in page. Also handles invitation acceptance when ?invite_token=… is present.
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitation } from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Factory } from "lucide-react";

const searchSchema = z.object({
  invite_token: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Sign in — ManuManuals" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { invite_token } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitation);

  const [mode, setMode] = useState<"signin" | "accept">(
    invite_token ? "accept" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect away if already signed in
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite_token) return;
    setLoading(true);
    try {
      const res = await accept({
        data: { token: invite_token, password, fullName },
      });
      toast.success("Invitation accepted. Signing you in…");
      const { error } = await supabase.auth.signInWithPassword({
        email: res.email,
        password,
      });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Factory className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {mode === "accept" ? "Accept invitation" : "Sign in to ManuManuals"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "accept"
              ? "Set a password to activate your account."
              : "Manufacturing InstallOps platform."}
          </p>
        </CardHeader>
        <CardContent>
          {mode === "accept" ? (
            <form className="space-y-4" onSubmit={handleAccept}>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Activating…" : "Activate account"}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignIn}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Signups are invite-only. Got an invite link? Open it directly.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
