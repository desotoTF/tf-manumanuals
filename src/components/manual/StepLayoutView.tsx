// Read-only renderer for a step, driven by step.layout + step.slots (new
// model). Legacy `blocks`/`body` data is normalised on the way in.
import { cn } from "@/lib/utils";
import { FigureRefs, resolveFigureTokensInHtml } from "@/lib/figure-refs";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import {
  normalizeStep,
  type ManualStep,
  type StepCallout,
  type StepSlot,
} from "@/lib/types";

interface AssetMap {
  [assetId: string]: { url: string | null; caption?: string | null };
}

interface Props {
  step: ManualStep;
  assets: AssetMap;
  figMap: Map<string, number>;
  pdfSafe?: boolean;
}

export function StepLayoutView({ step, assets, figMap, pdfSafe = false }: Props) {
  const s = normalizeStep(step);
  const layout = s.layout ?? "two_col";
  const slots = s.slots ?? [];

  // The implicit ##Fig. token inside this step resolves to the first image
  // figure number anywhere in the step's slots.
  let stepImageNumber: number | null = null;
  for (const sl of slots) {
    if (sl.asset_id) {
      const n = figMap.get(sl.asset_id);
      if (n) {
        stepImageNumber = n;
        break;
      }
    }
  }

  const containerCls =
    layout === "two_col"
      ? "grid grid-cols-1 gap-4 md:grid-cols-2"
      : "grid grid-cols-1 gap-4";

  if (pdfSafe) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: layout === "two_col" ? "1fr 1fr" : "1fr",
          gap: 16,
        }}
      >
        {slots.map((slot) => (
          <SlotView
            key={slot.id}
            slot={slot}
            assets={assets}
            figMap={figMap}
            stepImageNumber={stepImageNumber}
            pdfSafe
          />
        ))}
      </div>
    );
  }

  return (
    <div className={containerCls}>
      {slots.map((slot) => (
        <SlotView
          key={slot.id}
          slot={slot}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
          pdfSafe={pdfSafe}
        />
      ))}
    </div>
  );
}

function SlotView({
  slot,
  assets,
  figMap,
  stepImageNumber,
  pdfSafe,
}: {
  slot: StepSlot;
  assets: AssetMap;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
  pdfSafe?: boolean;
}) {
  const asset = slot.asset_id ? assets[slot.asset_id] : null;
  if (pdfSafe) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {asset?.url && (
          <figure
            style={{
              margin: 0,
              overflow: "hidden",
              border: "1px solid #D9DDE5",
              borderRadius: 6,
            }}
          >
            <img
              src={asset.url}
              alt={slot.caption ?? asset.caption ?? ""}
              style={{ display: "block", height: "auto", width: "100%" }}
              crossOrigin="anonymous"
            />
            {(slot.caption || asset.caption) && (
              <figcaption
                style={{
                  borderTop: "1px solid #D9DDE5",
                  background: "#F6F7F9",
                  color: "#5F6B7A",
                  padding: "8px 12px",
                  fontSize: 11,
                }}
              >
                {slot.caption || asset.caption}
              </figcaption>
            )}
          </figure>
        )}
        {slot.text_html && (
          <div
            style={{ color: "#000000", fontSize: 12, lineHeight: 1.45 }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: resolveFigureTokensInHtml(
                slot.text_html,
                figMap,
                stepImageNumber,
              ),
            }}
          />
        )}
        {slot.callout && (
          <CalloutView
            callout={slot.callout}
            figMap={figMap}
            stepImageNumber={stepImageNumber}
            pdfSafe
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {asset?.url && (
        <figure className="overflow-hidden rounded-md border border-border">
          <img
            src={asset.url}
            alt={slot.caption ?? asset.caption ?? ""}
            className="block h-auto w-full"
            loading="lazy"
          />
          {(slot.caption || asset.caption) && (
            <figcaption className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {slot.caption || asset.caption}
            </figcaption>
          )}
        </figure>
      )}
      {slot.text_html && (
        <div
          className="prose prose-sm dark:prose-invert max-w-none text-sm"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: resolveFigureTokensInHtml(
              slot.text_html,
              figMap,
              stepImageNumber,
            ),
          }}
        />
      )}
      {slot.callout && (
        <CalloutView
          callout={slot.callout}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
          pdfSafe={pdfSafe}
        />
      )}
    </div>
  );
}

function CalloutView({
  callout,
  figMap,
  stepImageNumber,
  pdfSafe,
}: {
  callout: StepCallout;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
  pdfSafe?: boolean;
}) {
  if (pdfSafe) {
    const palette = {
      info: { border: "#60A5FA", bg: "#EFF6FF", color: "#1D4ED8" },
      caution: { border: "#F59E0B", bg: "#FFFBEB", color: "#B45309" },
      danger: { border: "#F43F5E", bg: "#FFF1F2", color: "#BE123C" },
    }[callout.severity];
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          border: `1px solid ${palette.border}`,
          background: palette.bg,
          color: palette.color,
          borderRadius: 6,
          padding: 12,
          fontSize: 12,
        }}
      >
        <span aria-hidden style={{ fontWeight: 700 }}>!</span>
        <p style={{ margin: 0 }}>
          <FigureRefs
            text={callout.body}
            figMap={figMap}
            stepImageNumber={stepImageNumber}
          />
        </p>
      </div>
    );
  }

  const map = {
    info: {
      icon: Info,
      cls: "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300",
    },
    caution: {
      icon: AlertTriangle,
      cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    },
    danger: {
      icon: ShieldAlert,
      cls: "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300",
    },
  }[callout.severity];
  const Icon = map.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        map.cls,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <FigureRefs
          text={callout.body}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      </p>
    </div>
  );
}
