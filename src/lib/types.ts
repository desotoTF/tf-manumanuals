// Shared TS types for ManuManuals — derived from DB types + structured-content schema.
import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];
export type Org = Tables["organizations"]["Row"];
export type Profile = Tables["profiles"]["Row"];
export type Membership = Tables["memberships"]["Row"];
export type OrgRole = Database["public"]["Enums"]["org_role"];
export type Product = Tables["products"]["Row"];
export type BomSnapshot = Tables["bom_snapshots"]["Row"];
export type Manual = Tables["manuals"]["Row"];
export type ManualVersion = Tables["manual_versions"]["Row"];
export type ManualSyncStatusRow = Tables["manual_sync_status"]["Row"];
export type ManualSyncStatusKind =
  Database["public"]["Enums"]["manual_sync_status_kind"];
export type ErpConnection = Tables["erp_connections"]["Row"];
export type ErpProvider = Database["public"]["Enums"]["erp_provider"];
export type Tool = Tables["tools"]["Row"];
export type BomExclusion = Tables["bom_exclusions"]["Row"];
export type BomExclusionMatchType =
  Database["public"]["Enums"]["bom_exclusion_match_type"];

// Normalized BOM line item shape stored in bom_snapshots.normalized_items
export interface NormalizedBomItem {
  part_number: string;
  qty: number;
  description?: string;
  unit?: string;
  notes?: string;
}

export interface ManualPart {
  part_number: string;
  qty: number;
  description?: string;
  notes?: string;
}

// Manual content schema stored in manual_versions.content (JSONB).
// `hardware_kit` is sourced from the BOM of the {parent_sku}.x child product.
export interface ManualContent {
  tools: { name: string; spec?: string }[];
  parts: ManualPart[];
  hardware_kit: ManualPart[];
  steps: ManualStep[];
  warnings: { severity: "info" | "caution" | "danger"; title?: string; body: string }[];
  torque_specs: {
    fastener: string;
    value: number;
    unit: string;
    sequence?: string;
  }[];
  images: { asset_id: string; caption?: string }[];
  // Pages + blocks scaffold (additive; older drafts have it undefined).
  pages?: ManualPage[];
  // Cover image shown on page 1, between the SKU line and the company footer.
  // Sourced from Odoo's product.template.image_1920 by default, replaceable
  // by the editor.
  hero_image_url?: string | null;
  // A single callout rendered on page 2 (Parts & Tools) above the two-col
  // block. Kept outside the step so it's always available even when there
  // are no extra steps.
  parts_page_callout?: {
    severity: "info" | "caution" | "danger";
    body: string;
  } | null;
  // Optional extra one-column steps rendered on page 2 below the parts +
  // tools + BOM images block. Content that overflows the page continues on
  // page 3.
  parts_page_steps?: ManualStep[];
}

// A single installation step.
//   New model: `layout` + `slots` (slot = text + optional image + optional callout).
//   Legacy:    `body` (plain text) and/or `blocks` (old block editor). Both are
//   kept on the type so older drafts read cleanly until the editor saves them
//   into the new shape.
export interface ManualStep {
  id: string;
  title: string;
  layout?: StepLayout;
  slots?: StepSlot[];
  body?: string;
  blocks?: StepBlock[];
  asset_ids?: string[];
}

// ---- Step layout / slot model ----
export type StepLayout = "one_col" | "two_col" | "two_row";

export const STEP_LAYOUT_LABEL: Record<StepLayout, string> = {
  one_col: "One column",
  two_col: "Two columns",
  two_row: "Two rows",
};

export const STEP_LAYOUT_SLOT_COUNT: Record<StepLayout, number> = {
  one_col: 1,
  two_col: 2,
  two_row: 2,
};

export const ALL_STEP_LAYOUTS: StepLayout[] = ["one_col", "two_col", "two_row"];

export interface StepCallout {
  severity: "info" | "caution" | "danger";
  body: string;
}

export interface StepSlot {
  id: string;
  text_html: string;
  asset_id: string | null;
  caption?: string;
  callout?: StepCallout | null;
}

export const DEFAULT_STEP_LAYOUT: StepLayout = "two_col";

const newSlotId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function newStepSlot(): StepSlot {
  return {
    id: newSlotId(),
    text_html: "",
    asset_id: null,
    caption: "",
    callout: null,
  };
}

export function newStep(layout: StepLayout = DEFAULT_STEP_LAYOUT): ManualStep {
  const n = STEP_LAYOUT_SLOT_COUNT[layout];
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}`,
    title: "",
    layout,
    slots: Array.from({ length: n }, newStepSlot),
  };
}

// Normalize a step into the new `layout`+`slots` model, migrating any legacy
// `body` or `blocks[]` data on read. Pure: never mutates the input.
export function normalizeStep(step: ManualStep): ManualStep {
  if (step.slots && step.layout) {
    const count = STEP_LAYOUT_SLOT_COUNT[step.layout];
    if (step.slots.length === count) return step;
    const slots = step.slots.slice(0, count);
    while (slots.length < count) slots.push(newStepSlot());
    return { ...step, slots };
  }

  // Derive a layout + slots from legacy data.
  const slots: StepSlot[] = [];
  let layout: StepLayout = DEFAULT_STEP_LAYOUT;

  if (step.blocks && step.blocks.length > 0) {
    // Heuristic: a single two_column block → two_col; otherwise pack the
    // first text/image blocks into a one_col slot.
    const first = step.blocks[0];
    if (first.type === "two_column") {
      layout = "two_col";
      const toSlot = (cell: TextStepBlock | ImageStepBlock): StepSlot => {
        const base = newStepSlot();
        if (cell.type === "text") return { ...base, text_html: cell.html };
        return {
          ...base,
          asset_id: cell.asset_id ?? null,
          caption: cell.caption ?? "",
        };
      };
      slots.push(toSlot(first.left));
      slots.push(toSlot(first.right));
    } else {
      layout = "one_col";
      const slot = newStepSlot();
      for (const b of step.blocks) {
        if (b.type === "text" && !slot.text_html) slot.text_html = b.html;
        else if (b.type === "image" && !slot.asset_id) {
          slot.asset_id = b.asset_id ?? null;
          slot.caption = b.caption ?? "";
        } else if (b.type === "callout" && !slot.callout) {
          slot.callout = { severity: b.severity, body: b.body };
        }
      }
      slots.push(slot);
    }
  } else if (step.body) {
    layout = "one_col";
    const slot = newStepSlot();
    slot.text_html = `<p>${step.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</p>`;
    slots.push(slot);
  } else {
    layout = DEFAULT_STEP_LAYOUT;
    const count = STEP_LAYOUT_SLOT_COUNT[layout];
    for (let i = 0; i < count; i++) slots.push(newStepSlot());
  }

  return { ...step, layout, slots, body: undefined, blocks: undefined };
}

export function changeStepLayout(
  step: ManualStep,
  next: StepLayout,
): ManualStep {
  const cur = normalizeStep(step);
  if (cur.layout === next) return cur;
  const target = STEP_LAYOUT_SLOT_COUNT[next];
  const slots = (cur.slots ?? []).slice(0, target);
  while (slots.length < target) slots.push(newStepSlot());
  return { ...cur, layout: next, slots };
}


// ---- Step block types ----
export type StepBlockType =
  | "text"
  | "image"
  | "two_column"
  | "callout"
  | "table"
  | "figure_row";

export type ImageSize = "small" | "medium" | "full";

export interface TextStepBlock {
  id: string;
  type: "text";
  // TipTap HTML; sanitised on render. Empty string when blank.
  html: string;
}
export interface ImageStepBlock {
  id: string;
  type: "image";
  asset_id: string | null;
  caption?: string;
  size?: ImageSize;
  align?: "left" | "center" | "right";
}
export interface CalloutStepBlock {
  id: string;
  type: "callout";
  severity: "info" | "caution" | "danger";
  body: string;
}
export interface TwoColumnStepBlock {
  id: string;
  type: "two_column";
  left: TextStepBlock | ImageStepBlock;
  right: TextStepBlock | ImageStepBlock;
}
export type StepBlock =
  | TextStepBlock
  | ImageStepBlock
  | CalloutStepBlock
  | TwoColumnStepBlock;

export const ALL_STEP_BLOCK_TYPES: StepBlockType[] = [
  "text",
  "image",
  "two_column",
  "callout",
];

export const STEP_BLOCK_LABEL: Record<StepBlockType, string> = {
  text: "Text",
  image: "Image",
  two_column: "Two-column",
  callout: "Callout",
  table: "Table",
  figure_row: "Figure row",
};

const newBlockId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function newStepBlock(type: StepBlockType): StepBlock | null {
  switch (type) {
    case "text":
      return { id: newBlockId(), type: "text", html: "" };
    case "image":
      return {
        id: newBlockId(),
        type: "image",
        asset_id: null,
        size: "medium",
        align: "center",
      };
    case "callout":
      return { id: newBlockId(), type: "callout", severity: "info", body: "" };
    case "two_column":
      return {
        id: newBlockId(),
        type: "two_column",
        left: { id: newBlockId(), type: "text", html: "" },
        right: {
          id: newBlockId(),
          type: "image",
          asset_id: null,
          size: "medium",
          align: "center",
        },
      };
    default:
      return null; // table / figure_row not yet implemented
  }
}

export const emptyManualContent = (): ManualContent => ({
  tools: [],
  parts: [],
  hardware_kit: [],
  steps: [],
  warnings: [],
  torque_specs: [],
  images: [],
  pages: [],
});

// Canonical "SKU | Name" label used in manual lists, breadcrumbs, filters.
export const formatManualLabel = (sku: string, name: string) =>
  `${sku} | ${name}`;

// ----------------- Pages + Blocks (scaffold) -----------------
// Per-page layout module. Each layout has a fixed slot count; blocks fill slots
// in order. Numbering of image blocks is computed by walking pages/images in
// order (see useFigureMap).
export type PageLayout =
  | "single"
  | "image_text_v"
  | "image_text_h"
  | "two_image_text"
  | "two_image_text_vertical";

export const PAGE_LAYOUT_SLOTS: Record<PageLayout, number> = {
  single: 1,
  image_text_v: 2,
  image_text_h: 2,
  two_image_text: 4,
  two_image_text_vertical: 4,
};

export const PAGE_LAYOUT_LABEL: Record<PageLayout, string> = {
  single: "Single block",
  image_text_v: "Image over text",
  image_text_h: "Image · Text (side by side)",
  two_image_text: "2× Image+Text (side by side)",
  two_image_text_vertical: "2× Image+Text (stacked)",
};

export type BlockKind =
  | "text"
  | "image"
  | "parts"
  | "hardware_kit"
  | "tools"
  | "warnings"
  | "torque"
  | "steps";

export interface BaseBlock {
  id: string;
  kind: BlockKind;
}
export interface TextBlock extends BaseBlock {
  kind: "text";
  body: string;
}
export interface ImageBlock extends BaseBlock {
  kind: "image";
  asset_id: string;
  caption?: string;
}
export type Block =
  | TextBlock
  | ImageBlock
  | (BaseBlock & { kind: Exclude<BlockKind, "text" | "image"> });

export interface ManualPage {
  id: string;
  layout: PageLayout;
  blocks: Block[];
}

// Token format used inside any text body to reference an image. The number
// shown to the reader is recomputed at render time from useFigureMap so
// inserting/removing/reordering images updates all references at once.
//   {{fig:<asset_id>}}  →  "Fig. 3"   (rendered)
export const FIGURE_TOKEN_RE = /\{\{fig:([a-zA-Z0-9_-]+)\}\}/g;
export const figureToken = (assetId: string) => `{{fig:${assetId}}}`;

