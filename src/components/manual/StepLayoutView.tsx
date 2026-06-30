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
}

export function StepLayoutView({ step, assets, figMap }: Props) {
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

  return (
    <div className={containerCls}>
      {slots.map((slot) => (
        <SlotView
          key={slot.id}
          slot={slot}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
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
}: {
  slot: StepSlot;
  assets: AssetMap;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
}) {
  const asset = slot.asset_id ? assets[slot.asset_id] : null;
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
        />
      )}
    </div>
  );
}

function CalloutView({
  callout,
  figMap,
  stepImageNumber,
}: {
  callout: StepCallout;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
}) {
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
