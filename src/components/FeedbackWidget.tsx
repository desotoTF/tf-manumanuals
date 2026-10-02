// Header "Feedback" button + one-time post-publish question.
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Kind = "general" | "bug" | "idea" | "post_publish";
const ASKED_KEY = "mm_post_publish_asked";

export function askPostPublishFeedback() {
  if (typeof window === "undefined" || localStorage.getItem(ASKED_KEY)) return;
  localStorage.setItem(ASKED_KEY, "1");
  setTimeout(() => window.dispatchEvent(new CustomEvent("mm:feedback", { detail: "post_publish" })), 1500);
}

export function FeedbackWidget({ orgId }: { orgId: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("general");
  const [rating, setRating] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: Event) => { setKind((e as CustomEvent).detail as Kind); setOpen(true); };
    window.addEventListener("mm:feedback", h);
    return () => window.removeEventListener("mm:feedback", h);
  }, []);

  const submit = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("feedback" as never).insert({
      kind, rating, message: msg.trim().slice(0, 4000), page: window.location.pathname, organization_id: orgId,
    } as never);
    setBusy(false);
    if (error) return toast.error("Couldn't send feedback. Please try again.");
    toast.success("Thanks — we read every message.");
    setOpen(false); setMsg(""); setRating(null); setKind("general");
  };

  const post = kind === "post_publish";
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setKind("general"); setOpen(true); }}>
        <MessageSquare className="mr-2 h-4 w-4" /> Feedback
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{post ? "You published a manual! 🎉" : "Send feedback"}</DialogTitle>
            <DialogDescription>{post ? "How easy was it to get here? What almost stopped you?" : "Found a bug or have an idea? Tell us."}</DialogDescription>
          </DialogHeader>
          {post ? (
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} size="sm" variant={rating === n ? "default" : "outline"} onClick={() => setRating(n)}>{n}</Button>
              ))}
              <span className="ml-2 self-center text-xs text-muted-foreground">1 = hard, 5 = easy</span>
            </div>
          ) : (
            <div className="flex gap-1">
              {(["general", "bug", "idea"] as const).map((k) => (
                <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{k === "general" ? "General" : k === "bug" ? "Bug" : "Idea"}</Button>
              ))}
            </div>
          )}
          <Textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Your message" maxLength={4000} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
            <Button onClick={submit} disabled={busy || !msg.trim()}>{busy ? "Sending…" : "Send"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
