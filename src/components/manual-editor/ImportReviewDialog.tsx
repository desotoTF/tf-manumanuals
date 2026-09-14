// Progress + chapter review UI for a Docsie video import. Rendered inside the
// "Create manual" dialog once an import job has been started.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { applyVideoImport, getImportJob } from "@/lib/docsie.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STEP_LAYOUT_LABEL, type StepLayout } from "@/lib/types";

type ChapterChoice = {
  key: string;
  title: string;
  layout: StepLayout;
  include: boolean;
};

export function VideoImportPanel({
  jobId,
  onDone,
  onCancel,
}: {
  jobId: string;
  onDone: (productId: string) => void;
  onCancel: () => void;
}) {
  const fetchJob = useServerFn(getImportJob);
  const applyImport = useServerFn(applyVideoImport);
  const [choices, setChoices] = useState<ChapterChoice[] | null>(null);

  const job = useQuery({
    queryKey: ["import-job", jobId],
    queryFn: () => fetchJob({ data: { jobId } }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && ["ready", "applied", "failed", "canceled"].includes(s)
        ? false
        : 5000;
    },
  });

  const chapters = job.data?.chapters ?? [];

  useEffect(() => {
    if (job.data?.status === "ready" && chapters.length && !choices) {
      setChoices(
        chapters.map((c) => ({
          key: c.key,
          title: c.title,
          layout: c.suggestedLayout as StepLayout,
          include: true,
        })),
      );
    }
  }, [job.data?.status, chapters, choices]);

  const applyMut = useMutation({
    mutationFn: () =>
      applyImport({ data: { jobId, chapters: choices ?? [] } }),
    onSuccess: () => {
      toast.success("Sections imported into the manual");
      const productId = job.data?.product_id;
      if (productId) onDone(productId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const includedCount = useMemo(
    () => (choices ?? []).filter((c) => c.include).length,
    [choices],
  );

  const status = job.data?.status;

  if (job.isLoading || !job.data) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Starting import…
      </div>
    );
  }

  if (status === "failed" || status === "canceled") {
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div>
            <p className="font-medium">Video import didn't finish</p>
            <p className="text-muted-foreground">
              {job.data.error ?? "The import was canceled."}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          The manual was still created — you can open it and build it by hand.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Close
          </Button>
          {job.data.product_id && (
            <Button onClick={() => onDone(job.data!.product_id!)}>
              Open manual
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (status !== "ready" && status !== "applied") {
    return (
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Progress value={job.data.progress} />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job.data.status_detail ?? "Processing video"} · {job.data.progress}%
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Docsie is watching the video and writing sections. This usually takes a
          few minutes. You can leave this open — or close it and the manual will
          be waiting in your list.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Close
          </Button>
          {job.data.product_id && (
            <Button variant="secondary" onClick={() => onDone(job.data!.product_id!)}>
              Open manual now
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <span>
          {chapters.length} section{chapters.length === 1 ? "" : "s"} found
          {job.data.result_title ? ` · ${job.data.result_title}` : ""}
        </span>
      </div>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto rounded-md border border-border p-3">
        {(choices ?? []).map((c, i) => {
          const src = chapters.find((ch) => ch.key === c.key);
          return (
            <div
              key={c.key}
              className="grid grid-cols-[auto_1fr_11rem] items-center gap-3"
            >
              <Checkbox
                checked={c.include}
                onCheckedChange={(v) =>
                  setChoices((prev) =>
                    (prev ?? []).map((p, idx) =>
                      idx === i ? { ...p, include: Boolean(v) } : p,
                    ),
                  )
                }
              />
              <div className="space-y-1">
                <Input
                  value={c.title}
                  onChange={(e) =>
                    setChoices((prev) =>
                      (prev ?? []).map((p, idx) =>
                        idx === i ? { ...p, title: e.target.value } : p,
                      ),
                    )
                  }
                />
                {src && src.images.length > 0 && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="h-3 w-3" />
                    {src.images.length} image{src.images.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <Select
                value={c.layout}
                onValueChange={(v) =>
                  setChoices((prev) =>
                    (prev ?? []).map((p, idx) =>
                      idx === i ? { ...p, layout: v as StepLayout } : p,
                    ),
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["one_col", "two_col", "two_row"] as StepLayout[]).map((l) => (
                    <SelectItem key={l} value={l}>
                      {STEP_LAYOUT_LABEL[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Tools, parts and hardware stay empty — add them in the editor.
        </Label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={includedCount === 0 || applyMut.isPending}
          >
            {applyMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building…
              </>
            ) : (
              `Build manual (${includedCount})`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
