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
}

export const emptyManualContent = (): ManualContent => ({
  tools: [],
  parts: [],
  hardware_kit: [],
  steps: [],
  warnings: [],
  torque_specs: [],
  images: [],
});
