// Visibility selector + stable public link + QR code download for a manual.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { toast } from "sonner";
import { getManualVisibility, setManualVisibility } from "@/lib/plans.functions";
import { getManualViewStats } from "@/lib/analytics.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Vis = "public_indexed" | "public_unlisted" | "private";
const HELP: Record<Vis, string> = {
  public_indexed: "Anyone can view and search for this manual.",
  public_unlisted: "Anyone with the link can view; search engines are asked not to index it.",
  private: "Only workspace members can view it.",
};

export function ShareManualPanel({
  manualId,
  publicPath,
  isPublished,
  canEdit,
}: {
  manualId: string;
  publicPath: string;
  isPublished: boolean;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const getVis = useServerFn(getManualVisibility);
  const setVis = useServerFn(setManualVisibility);
  const { data: vis = "public_unlisted" } = useQuery({
    queryKey: ["manual-visibility", manualId],
    queryFn: () => getVis({ data: { manualId } }),
  });
  const mut = useMutation({
    mutationFn: (v: Vis) => setVis({ data: { manualId, visibility: v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-visibility", manualId] });
      toast.success("Visibility updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update visibility"),
  });

  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? `${origin}${publicPath}` : publicPath;
  const qrEnabled = isPublished && vis !== "private";
  const qrUrl = `${url}${url.includes("?") ? "&" : "?"}src=qr`;
  const getStats = useServerFn(getManualViewStats);
  const { data: stats } = useQuery({
    queryKey: ["manual-views", manualId],
    queryFn: () => getStats({ data: { manualId } }),
    enabled: isPublished,
  });

  useEffect(() => {
    if (!qrEnabled || !origin) return setQr(null);
    QRCode.toDataURL(qrUrl, { width: 512, margin: 2 }).then(setQr).catch(() => setQr(null));
  }, [qrEnabled, qrUrl, origin]);

  const download = async (kind: "png" | "svg") => {
    const a = document.createElement("a");
    if (kind === "png") {
      a.href = await QRCode.toDataURL(qrUrl, { width: 1024, margin: 2 });
    } else {
      const svg = await QRCode.toString(qrUrl, { type: "svg", margin: 2 });
      a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    }
    a.download = `manual-qr.${kind}`;
    a.click();
  };

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <label className="text-xs font-medium">Who can view</label>
      <Select value={vis} onValueChange={(v) => mut.mutate(v as Vis)} disabled={!canEdit || mut.isPending}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="public_indexed">Public + indexed</SelectItem>
          <SelectItem value="public_unlisted">Public + unlisted</SelectItem>
          <SelectItem value="private">Private / internal</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">{HELP[vis]}</p>

      {isPublished && vis !== "private" && (
        <>
          <div className="flex gap-1">
            <input readOnly value={url} className="h-7 flex-1 rounded border border-input bg-background px-2 text-[11px]" />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
            >
              Copy
            </Button>
          </div>
          {stats && (
            <p className="text-[11px] text-muted-foreground">
              Views: {stats.last30} in last 30 days · {stats.total} total · {stats.qr} from QR scans
            </p>
          )}
          {qr && (
            <div className="flex items-center gap-3">
              <img src={qr} alt="Scan for the latest manual" className="h-20 w-20 rounded border border-border" />
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Scan for the latest manual.</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => download("png")}>
                    PNG
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => download("svg")}>
                    SVG
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {!isPublished && <p className="text-[11px] text-muted-foreground">Publish to get a shareable link and QR code.</p>}
    </div>
  );
}
