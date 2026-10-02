// User's own account page: edit display name and change password.
// Password change calls supabase.auth.updateUser directly from the client.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, UserCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setFullName(profile?.full_name ?? "");
      setLoadingProfile(false);
    })();
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", userId);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPw(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPw1("");
    setPw2("");
    toast.success("Password changed");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <UserCircle2 className="h-6 w-6 text-primary" /> Account
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and password.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Email is managed by your sign-in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loadingProfile}
              />
            </div>
            <Button type="submit" disabled={savingProfile || loadingProfile}>
              {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            If you signed in with a temporary password, set a new one here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="pw1">New password</Label>
              <Input
                id="pw1"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm new password</Label>
              <Input
                id="pw2"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={savingPw}>
              {savingPw && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
