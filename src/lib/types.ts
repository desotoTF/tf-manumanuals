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
  steps: {
    id: string;
    title: string;
    body: string;
    asset_ids?: string[];
  }[];
  warnings: { severity: "info" | "caution" | "danger"; body: string }[];
  torque_specs: {
    fastener: string;
    value: number;
    unit: string;
    sequence?: string;
  }[];
  images: { asset_id: string; caption?: string }[];
  // Pages + blocks scaffold (additive; older drafts have it undefined).
  // The editor still uses the flat arrays above; pages-based layout shipping
  // incrementally — see ManualPage / PageLayout below.
  pages?: ManualPage[];
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

