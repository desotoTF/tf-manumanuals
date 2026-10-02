import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminGetOrgPlan, adminSetOrgPlan } from "@/lib/plan-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PLANS = ["free", "creator", "team", "operations", "enterprise", "legacy"] as const;
type Plan = (typeof PLANS)[number];

export function OrgPlanOverride({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(adminGetOrgPlan);
  const set = useServerFn(adminSetOrgPlan);
  const q = useQuery({ queryKey: ["admin", "org-plan", orgId], queryFn: () => get({ data: { organizationId: orgId } }) });
  const [plan, setPlan] = useState<Plan>("free");
  const [note, setNote] = useState("");
  useEffect(() => { if (q.data) { setPlan(q.data.plan_key as Plan); setNote(q.data.override_note ?? ""); } }, [q.data]);
  const m = useMutation({
    mutationFn: () => set({ data: { organizationId: orgId, plan, note } }),
    onSuccess: () => { toast.success("Plan updated"); qc.invalidateQueries({ queryKey: ["admin", "org-plan", orgId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Plan</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Current: <strong>{q.data?.plan_key ?? "—"}</strong> ({q.data?.billing_status ?? "—"})
          {q.data?.stripe_subscription_id && " · has a paid subscription — changes in billing will overwrite this"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={plan} onValueChange={(v) => setPlan(v as Plan)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="flex-1 min-w-48" placeholder="Reason (e.g. complimentary beta)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save plan</Button>
        </div>
      </CardContent>
    </Card>
  );
}
