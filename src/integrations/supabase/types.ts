export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bom_exclusions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_seed: boolean
          match_type: Database["public"]["Enums"]["bom_exclusion_match_type"]
          note: string | null
          organization_id: string
          pattern: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_seed?: boolean
          match_type?: Database["public"]["Enums"]["bom_exclusion_match_type"]
          note?: string | null
          organization_id: string
          pattern: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_seed?: boolean
          match_type?: Database["public"]["Enums"]["bom_exclusion_match_type"]
          note?: string | null
          organization_id?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_exclusions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_snapshots: {
        Row: {
          captured_at: string
          content_hash: string
          created_at: string
          erp_bom_id: string | null
          erp_bom_revision: string | null
          erp_connection_id: string | null
          id: string
          normalized_items: Json
          product_id: string
          raw_payload: Json
        }
        Insert: {
          captured_at?: string
          content_hash: string
          created_at?: string
          erp_bom_id?: string | null
          erp_bom_revision?: string | null
          erp_connection_id?: string | null
          id?: string
          normalized_items?: Json
          product_id: string
          raw_payload?: Json
        }
        Update: {
          captured_at?: string
          content_hash?: string
          created_at?: string
          erp_bom_id?: string | null
          erp_bom_revision?: string | null
          erp_connection_id?: string | null
          id?: string
          normalized_items?: Json
          product_id?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bom_snapshots_erp_connection_id_fkey"
            columns: ["erp_connection_id"]
            isOneToOne: false
            referencedRelation: "erp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_connections: {
        Row: {
          base_url: string
          created_at: string
          credentials_version: number
          database: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          name: string
          organization_id: string
          provider: Database["public"]["Enums"]["erp_provider"]
          secret_name: string | null
          updated_at: string
          username: string
          vault_secret_id: string | null
        }
        Insert: {
          base_url: string
          created_at?: string
          credentials_version?: number
          database?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          name: string
          organization_id: string
          provider?: Database["public"]["Enums"]["erp_provider"]
          secret_name?: string | null
          updated_at?: string
          username: string
          vault_secret_id?: string | null
        }
        Update: {
          base_url?: string
          created_at?: string
          credentials_version?: number
          database?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          name?: string
          organization_id?: string
          provider?: Database["public"]["Enums"]["erp_provider"]
          secret_name?: string | null
          updated_at?: string
          username?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_credential_audit: {
        Row: {
          action: Database["public"]["Enums"]["erp_credential_action"]
          actor_user_id: string | null
          erp_connection_id: string
          id: string
          note: string | null
          occurred_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["erp_credential_action"]
          actor_user_id?: string | null
          erp_connection_id: string
          id?: string
          note?: string | null
          occurred_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["erp_credential_action"]
          actor_user_id?: string | null
          erp_connection_id?: string
          id?: string
          note?: string | null
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_credential_audit_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_credential_audit_erp_connection_id_fkey"
            columns: ["erp_connection_id"]
            isOneToOne: false
            referencedRelation: "erp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["org_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_assets: {
        Row: {
          created_at: string
          id: string
          manual_version_id: string
          metadata: Json
          storage_path: string | null
          type: Database["public"]["Enums"]["manual_asset_type"]
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          manual_version_id: string
          metadata?: Json
          storage_path?: string | null
          type?: Database["public"]["Enums"]["manual_asset_type"]
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          manual_version_id?: string
          metadata?: Json
          storage_path?: string | null
          type?: Database["public"]["Enums"]["manual_asset_type"]
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_assets_manual_version_id_fkey"
            columns: ["manual_version_id"]
            isOneToOne: false
            referencedRelation: "manual_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_sync_status: {
        Row: {
          current_bom_snapshot_id: string | null
          id: string
          last_bom_change_at: string | null
          last_manual_publish_at: string | null
          latest_published_version_id: string | null
          out_of_sync_since: string | null
          product_id: string
          status: Database["public"]["Enums"]["manual_sync_status_kind"]
          updated_at: string
        }
        Insert: {
          current_bom_snapshot_id?: string | null
          id?: string
          last_bom_change_at?: string | null
          last_manual_publish_at?: string | null
          latest_published_version_id?: string | null
          out_of_sync_since?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["manual_sync_status_kind"]
          updated_at?: string
        }
        Update: {
          current_bom_snapshot_id?: string | null
          id?: string
          last_bom_change_at?: string | null
          last_manual_publish_at?: string | null
          latest_published_version_id?: string | null
          out_of_sync_since?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["manual_sync_status_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_sync_status_current_bom_snapshot_id_fkey"
            columns: ["current_bom_snapshot_id"]
            isOneToOne: false
            referencedRelation: "bom_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sync_status_latest_published_version_id_fkey"
            columns: ["latest_published_version_id"]
            isOneToOne: false
            referencedRelation: "manual_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_sync_status_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_templates: {
        Row: {
          allowed_blocks: Json
          branding: Json
          created_at: string
          created_by: string | null
          default_content: Json
          description: string | null
          extra_modules: Json
          id: string
          is_default: boolean
          is_master: boolean
          layout: Database["public"]["Enums"]["manual_template_layout"]
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          allowed_blocks?: Json
          branding?: Json
          created_at?: string
          created_by?: string | null
          default_content?: Json
          description?: string | null
          extra_modules?: Json
          id?: string
          is_default?: boolean
          is_master?: boolean
          layout?: Database["public"]["Enums"]["manual_template_layout"]
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          allowed_blocks?: Json
          branding?: Json
          created_at?: string
          created_by?: string | null
          default_content?: Json
          description?: string | null
          extra_modules?: Json
          id?: string
          is_default?: boolean
          is_master?: boolean
          layout?: Database["public"]["Enums"]["manual_template_layout"]
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_versions: {
        Row: {
          approved_by: string | null
          bom_snapshot_id: string | null
          change_summary: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          manual_id: string
          pdf_url: string | null
          published_at: string | null
          source_pdf_path: string | null
          state: Database["public"]["Enums"]["manual_version_state"]
          updated_at: string
          version_number: number
        }
        Insert: {
          approved_by?: string | null
          bom_snapshot_id?: string | null
          change_summary?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          manual_id: string
          pdf_url?: string | null
          published_at?: string | null
          source_pdf_path?: string | null
          state?: Database["public"]["Enums"]["manual_version_state"]
          updated_at?: string
          version_number: number
        }
        Update: {
          approved_by?: string | null
          bom_snapshot_id?: string | null
          change_summary?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          manual_id?: string
          pdf_url?: string | null
          published_at?: string | null
          source_pdf_path?: string | null
          state?: Database["public"]["Enums"]["manual_version_state"]
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_versions_bom_snapshot_id_fkey"
            columns: ["bom_snapshot_id"]
            isOneToOne: false
            referencedRelation: "bom_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_versions_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manuals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lifecycle: Database["public"]["Enums"]["manual_lifecycle"]
          product_id: string
          source: string
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["manual_lifecycle"]
          product_id: string
          source?: string
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lifecycle?: Database["public"]["Enums"]["manual_lifecycle"]
          product_id?: string
          source?: string
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "manual_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          id: string
          occurred_at: string
          payload: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          erp_connection_id: string | null
          erp_product_id: string | null
          erp_template_id: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sku: string
          template_sku: string | null
          updated_at: string
          web_slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          erp_connection_id?: string | null
          erp_product_id?: string | null
          erp_template_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          sku: string
          template_sku?: string | null
          updated_at?: string
          web_slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          erp_connection_id?: string | null
          erp_product_id?: string | null
          erp_template_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sku?: string
          template_sku?: string | null
          updated_at?: string
          web_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_erp_connection_id_fkey"
            columns: ["erp_connection_id"]
            isOneToOne: false
            referencedRelation: "erp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_events: {
        Row: {
          erp_connection_id: string | null
          event_type: Database["public"]["Enums"]["sync_event_type"]
          id: string
          occurred_at: string
          organization_id: string
          payload: Json
          product_id: string | null
        }
        Insert: {
          erp_connection_id?: string | null
          event_type: Database["public"]["Enums"]["sync_event_type"]
          id?: string
          occurred_at?: string
          organization_id: string
          payload?: Json
          product_id?: string | null
        }
        Update: {
          erp_connection_id?: string | null
          event_type?: Database["public"]["Enums"]["sync_event_type"]
          id?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_events_erp_connection_id_fkey"
            columns: ["erp_connection_id"]
            isOneToOne: false
            referencedRelation: "erp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          spec: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          spec?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          spec?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      erp_delete_credentials: {
        Args: { _connection_id: string }
        Returns: undefined
      }
      erp_hard_delete_connection: {
        Args: { _connection_id: string }
        Returns: undefined
      }
      erp_read_credentials: { Args: { _connection_id: string }; Returns: Json }
      erp_store_credentials: {
        Args: { _api_key: string; _connection_id: string }
        Returns: string
      }
      has_org_access: { Args: { _org_id: string }; Returns: boolean }
      has_org_any_role: {
        Args: {
          _org_id: string
          _roles: Database["public"]["Enums"]["org_role"][]
        }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["org_role"]
        }
        Returns: boolean
      }
      has_platform_role: {
        Args: {
          _role: Database["public"]["Enums"]["platform_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      next_manual_version_number: {
        Args: { _manual_id: string }
        Returns: number
      }
      recompute_manual_sync_status: {
        Args: { _product_id: string }
        Returns: undefined
      }
    }
    Enums: {
      bom_exclusion_match_type: "exact" | "prefix" | "suffix" | "contains"
      erp_credential_action: "created" | "rotated" | "revoked"
      erp_provider:
        | "odoo"
        | "netsuite"
        | "dynamics365"
        | "epicor"
        | "infor"
        | "other"
      manual_asset_type: "image" | "diagram" | "video_reference"
      manual_lifecycle: "active" | "archived"
      manual_sync_status_kind:
        | "in_sync"
        | "out_of_sync"
        | "no_manual"
        | "pending_review"
      manual_template_layout:
        | "classic"
        | "compact"
        | "field_guide"
        | "service_card"
      manual_version_state:
        | "draft"
        | "in_review"
        | "approved"
        | "published"
        | "superseded"
      org_role: "owner" | "admin" | "editor" | "viewer"
      platform_role: "super_admin"
      sync_event_type:
        | "bom_sync_started"
        | "bom_sync_succeeded"
        | "bom_sync_failed"
        | "bom_change_detected"
        | "manual_published"
        | "manual_state_changed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bom_exclusion_match_type: ["exact", "prefix", "suffix", "contains"],
      erp_credential_action: ["created", "rotated", "revoked"],
      erp_provider: [
        "odoo",
        "netsuite",
        "dynamics365",
        "epicor",
        "infor",
        "other",
      ],
      manual_asset_type: ["image", "diagram", "video_reference"],
      manual_lifecycle: ["active", "archived"],
      manual_sync_status_kind: [
        "in_sync",
        "out_of_sync",
        "no_manual",
        "pending_review",
      ],
      manual_template_layout: [
        "classic",
        "compact",
        "field_guide",
        "service_card",
      ],
      manual_version_state: [
        "draft",
        "in_review",
        "approved",
        "published",
        "superseded",
      ],
      org_role: ["owner", "admin", "editor", "viewer"],
      platform_role: ["super_admin"],
      sync_event_type: [
        "bom_sync_started",
        "bom_sync_succeeded",
        "bom_sync_failed",
        "bom_change_detected",
        "manual_published",
        "manual_state_changed",
      ],
    },
  },
} as const
