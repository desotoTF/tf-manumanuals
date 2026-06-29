// Read-only renderer for step blocks. Used by the public manual page and
// any preview that wants the same output as installers see.
import { cn } from "@/lib/utils";
import { FigureRefs, resolveFigureTokensInHtml } from "@/lib/figure-refs";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type {
  CalloutStepBlock,
  ImageStepBlock,
  StepBlock,
  TextStepBlock,
  TwoColumnStepBlock,
} from "@/lib/types";

interface AssetMap {
  // asset_id → { url, caption? }
  [assetId: string]: { url: string | null; caption?: string | null };
}

interface Props {
  blocks: StepBlock[] | undefined;
  // Legacy fallback when the step has no blocks yet.
  legacyBody?: string;
  assets: AssetMap;
  figMap: Map<string, number>;
  // Figure number of this step's own first image block, used to resolve
  // {{fig:step}} / ##Fig. / @Fig. tokens inside this step's text.
  stepImageNumber?: number | null;
}

export function StepBlocksView({
  blocks,
  legacyBody,
  assets,
  figMap,
  stepImageNumber = null,
}: Props) {
  if ((!blocks || blocks.length === 0) && legacyBody) {
    return (
      <p className="whitespace-pre-line text-sm text-muted-foreground">
        <FigureRefs
          text={legacyBody}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      </p>
    );
  }
  if (!blocks || blocks.length === 0) return null;
  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <BlockView
          key={b.id}
          block={b}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  assets,
  figMap,
  stepImageNumber,
}: {
  block: StepBlock;
  assets: AssetMap;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
}) {
  switch (block.type) {
    case "text":
      return (
        <TextView
          block={block}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      );
    case "image":
      return <ImageView block={block} assets={assets} />;
    case "callout":
      return (
        <CalloutView
          block={block}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      );
    case "two_column":
      return (
        <TwoColumnView
          block={block}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      );
    default:
      return null;
  }
}

function TextView({
  block,
  figMap,
  stepImageNumber,
}: {
  block: TextStepBlock;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
}) {
  if (!block.html) return null;
  const html = resolveFigureTokensInHtml(block.html, figMap, stepImageNumber);
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-sm"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ImageView({
  block,
  assets,
}: {
  block: ImageStepBlock;
  assets: AssetMap;
}) {
  const asset = block.asset_id ? assets[block.asset_id] : null;
  if (!asset?.url) return null;
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md border border-border",
        block.size === "small" && "max-w-[240px]",
        block.size === "medium" && "max-w-[480px]",
        (block.align ?? "center") === "center" && "mx-auto",
        (block.align ?? "center") === "right" && "ml-auto",
      )}
    >
      <img
        src={asset.url}
        alt={block.caption ?? asset.caption ?? ""}
        className="block h-auto w-full"
        loading="lazy"
      />
      {(block.caption ?? asset.caption) && (
        <figcaption className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {block.caption ?? asset.caption}
        </figcaption>
      )}
    </figure>
  );
}

function CalloutView({
  block,
  figMap,
  stepImageNumber,
}: {
  block: CalloutStepBlock;
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
  }[block.severity];
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
          text={block.body}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      </p>
    </div>
  );
}

function TwoColumnView({
  block,
  assets,
  figMap,
  stepImageNumber,
}: {
  block: TwoColumnStepBlock;
  assets: AssetMap;
  figMap: Map<string, number>;
  stepImageNumber: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div>
        <BlockView
          block={block.left}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      </div>
      <div>
        <BlockView
          block={block.right}
          assets={assets}
          figMap={figMap}
          stepImageNumber={stepImageNumber}
        />
      </div>
    </div>
  );
}

