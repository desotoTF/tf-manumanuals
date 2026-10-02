import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { adminListFeedback } from "@/lib/analytics.functions";
import { adminListContactMessages } from "@/lib/contact.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_superadmin/admin/feedback")({
  head: () => ({ meta: [{ title: "Feedback inbox | ThumperFab" }, { name: "robots", content: "noindex" }] }),
  component: FeedbackInbox,
});

const KINDS = ["all", "bug", "idea", "general", "post_publish"] as const;

function FeedbackInbox() {
  const fetchFb = useServerFn(adminListFeedback);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const q = useQuery({ queryKey: ["admin", "feedback"], queryFn: () => fetchFb() });
  const fetchContact = useServerFn(adminListContactMessages);
  const cq = useQuery({ queryKey: ["admin", "contact"], queryFn: () => fetchContact() });
  const rows = (q.data ?? []).filter((r) => kind === "all" || r.kind === kind);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Feedback inbox</h1>
        <p className="text-sm text-muted-foreground">Everything users sent from the feedback button and the after-publish question. Most recent 300.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k} size="sm" variant={k === kind ? "default" : "outline"} onClick={() => setKind(k)}>
            {k === "post_publish" ? "After publish" : k[0].toUpperCase() + k.slice(1)}
          </Button>
        ))}
      </div>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {!q.isLoading && rows.length === 0 && <p className="text-sm text-muted-foreground">No feedback yet.</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{r.kind === "post_publish" ? "after publish" : r.kind}</Badge>
              {r.rating != null && <span>Rating {r.rating}/5</span>}
              <span>{r.email ?? "unknown user"}</span>
              {r.orgName && <span>· {r.orgName}</span>}
              {r.page && <span>· {r.page}</span>}
              <span className="ml-auto">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{r.message}</p>
          </li>
        ))}
      </ul>
      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Contact form messages</h2>
        {cq.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!cq.isLoading && (cq.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No contact messages yet.</p>}
        <ul className="space-y-3">
          {(cq.data ?? []).map((m) => (
            <li key={m.id} className="rounded-lg border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{m.topic}</Badge>
                <span>{m.name}</span>
                <a href={`mailto:${m.email}`} className="text-primary hover:underline">{m.email}</a>
                {m.organization && <span>· {m.organization}</span>}
                <span className="ml-auto">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
