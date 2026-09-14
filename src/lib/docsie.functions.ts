// Docsie "Video to Docs" integration: per-org connection management, video
// import jobs, and applying a finished import into a manual draft version.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  parseDocsieMarkdown,
  guessLayout,
  markdownTitle,
  collectAllImages,
  type DocsieChapter,
} from "@/lib/docsie-markdown";
import type { ManualContent, ManualStep, StepSlot } from "@/lib/types";

const uuid = z.string().uuid();

export interface IntegrationConnectionRow {
  id: string;
  organization_id: string;
  provider: "docsie";
  is_active: boolean;
  workspace_id: string | null;
  has_credentials: boolean;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJobRow {
  id: string;
  status:
    | "queued"
    | "submitted"
    | "processing"
    | "ready"
    | "applied"
    | "failed"
    | "canceled";
  progress: number;
  status_detail: string | null;
  error: string | null;
  result_title: string | null;
  manual_id: string | null;
  product_id: string | null;
  version_id: string | null;
  source_url: string;
  created_at: string;
}

const CONN_COLUMNS =
  "id, organization_id, provider, is_active, workspace_id, vault_secret_id, last_test_at, last_test_status, last_test_error, created_at, updated_at";

const toConnRow = (r: Record<string, unknown>): IntegrationConnectionRow => ({
  id: r.id as string,
  organization_id: r.organization_id as string,
  provider: r.provider as "docsie",
  is_active: Boolean(r.is_active),
  workspace_id: (r.workspace_id as string | null) ?? null,
  has_credentials: Boolean(r.vault_secret_id),
  last_test_at: (r.last_test_at as string | null) ?? null,
  last_test_status: (r.last_test_status as string | null) ?? null,
  last_test_error: (r.last_test_error as string | null) ?? null,
  created_at: r.created_at as string,
  updated_at: r.updated_at as string,
});

// ---------------- Connection management ----------------

export const listIntegrationConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("integration_connections" as never)
      .select(CONN_COLUMNS)
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return ((rows ?? []) as unknown as Record<string, unknown>[]).map(toConnRow);
  });

/** Import modules usable right now (active + credentials stored). */
export const listEnabledImportModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { organizationId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("integration_connections" as never)
      .select("provider, is_active, vault_secret_id")
      .eq("organization_id", data.organizationId);
    if (error) throw error;
    return ((rows ?? []) as unknown as Record<string, unknown>[])
      .filter((r) => r.is_active && r.vault_secret_id)
      .map((r) => r.provider as "docsie");
  });

export const saveDocsieConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        workspaceId: z.string().max(200).nullish(),
        apiKey: z.string().min(10).max(500).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("integration_connections" as never)
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("provider", "docsie")
      .maybeSingle();

    let id = (existing as { id: string } | null)?.id ?? null;

    if (id) {
      const { error } = await supabase
        .from("integration_connections" as never)
        .update({
          workspace_id: data.workspaceId ?? null,
          ...(data.isActive === undefined ? {} : { is_active: data.isActive }),
        } as never)
        .eq("id", id);
      if (error) throw error;
    } else {
      const { data: ins, error } = await supabase
        .from("integration_connections" as never)
        .insert({
          organization_id: data.organizationId,
          provider: "docsie",
          workspace_id: data.workspaceId ?? null,
          is_active: data.isActive ?? true,
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      id = (ins as { id: string }).id;
    }

    if (data.apiKey) {
      const { error: secErr } = await supabase.rpc(
        "integration_store_credentials" as never,
        { _connection_id: id, _api_key: data.apiKey } as never,
      );
      if (secErr) throw secErr;
    }

    return { id: id as string };
  });

async function loadAuth(
  supabase: { rpc: (fn: never, args: never) => Promise<{ data: unknown; error: unknown }> },
  connectionId: string,
  workspaceId: string | null,
) {
  const { data: cred, error } = await supabase.rpc(
    "integration_read_credentials" as never,
    { _connection_id: connectionId } as never,
  );
  if (error) throw error;
  const apiKey = (cred as { api_key?: string } | null)?.api_key;
  if (!apiKey) throw new Error("No Docsie API key stored for this organization.");
  return { apiKey, workspaceId };
}

export const testDocsieConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: conn, error } = await supabase
      .from("integration_connections" as never)
      .select("id, workspace_id")
      .eq("id", data.connectionId)
      .single();
    if (error) throw error;

    const { docsiePing } = await import("./docsie.server");
    let ok = true;
    let message: string | null = null;
    try {
      const auth = await loadAuth(
        supabase as never,
        data.connectionId,
        (conn as { workspace_id: string | null }).workspace_id,
      );
      await docsiePing(auth);
    } catch (e) {
      ok = false;
      message = (e as Error).message;
    }

    await supabase
      .from("integration_connections" as never)
      .update({
        last_test_at: new Date().toISOString(),
        last_test_status: ok ? "ok" : "failed",
        last_test_error: message,
      } as never)
      .eq("id", data.connectionId);

    return { ok, error: message };
  });

export const removeDocsieConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "integration_delete_connection" as never,
      { _connection_id: data.connectionId } as never,
    );
    if (error) throw error;
    return { ok: true as const };
  });

// ---------------- Video URL validation ----------------

const YT_RE =
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)[\w-]{6,}|youtu\.be\/[\w-]{6,})/i;

export const validateVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().min(5).max(500) }).parse(d))
  .handler(async ({ data }) => {
    if (!YT_RE.test(data.url.trim())) {
      return { ok: false as const, error: "That doesn't look like a YouTube link." };
    }
    const { probeYouTubeUrl } = await import("./docsie.server");
    const probe = await probeYouTubeUrl(data.url.trim());
    return probe.ok
      ? { ok: true as const, title: probe.title ?? null }
      : { ok: false as const, error: probe.error ?? "Video unavailable." };
  });

// ---------------- Import jobs ----------------

export const startVideoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organizationId: uuid,
        productId: uuid,
        manualId: uuid,
        versionId: uuid,
        videoUrl: z.string().min(5).max(500),
        title: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const url = data.videoUrl.trim();

    if (!YT_RE.test(url)) throw new Error("That doesn't look like a YouTube link.");

    const { probeYouTubeUrl, docsieSubmitVideo } = await import("./docsie.server");
    const probe = await probeYouTubeUrl(url);
    if (!probe.ok) throw new Error(probe.error ?? "Video unavailable.");

    const { data: conn, error: cErr } = await supabase
      .from("integration_connections" as never)
      .select("id, workspace_id, is_active")
      .eq("organization_id", data.organizationId)
      .eq("provider", "docsie")
      .maybeSingle();
    if (cErr) throw cErr;
    const connection = conn as
      | { id: string; workspace_id: string | null; is_active: boolean }
      | null;
    if (!connection || !connection.is_active) {
      throw new Error("Docsie is not enabled for this organization.");
    }

    const auth = await loadAuth(
      supabase as never,
      connection.id,
      connection.workspace_id,
    );

    const { data: job, error: jErr } = await supabase
      .from("manual_import_jobs" as never)
      .insert({
        organization_id: data.organizationId,
        product_id: data.productId,
        manual_id: data.manualId,
        version_id: data.versionId,
        provider: "docsie",
        source_url: url,
        status: "queued",
        progress: 5,
        status_detail: "Video verified",
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (jErr) throw jErr;
    const jobId = (job as { id: string }).id;

    try {
      const submitted = await docsieSubmitVideo(auth, {
        videoUrl: url,
        title: data.title,
      });
      await supabase
        .from("manual_import_jobs" as never)
        .update({
          external_job_id: submitted.job_id,
          status: "submitted",
          progress: 15,
          status_detail: "Submitted to Docsie",
        } as never)
        .eq("id", jobId);
    } catch (e) {
      await supabase
        .from("manual_import_jobs" as never)
        .update({
          status: "failed",
          error: (e as Error).message,
          status_detail: "Submission failed",
        } as never)
        .eq("id", jobId);
      throw e;
    }

    return { jobId };
  });

export interface ImportJobState extends ImportJobRow {
  chapters: (DocsieChapter & { suggestedLayout: "one_col" | "two_col" })[];
  /** Total images Docsie returned (all are added to the image library). */
  imageCount: number;
}

/** Polled by the UI. Proxies Docsie status server-side and caches the result. */
export const getImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ImportJobState> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("manual_import_jobs" as never)
      .select("*")
      .eq("id", data.jobId)
      .single();
    if (error) throw error;
    let job = row as unknown as Record<string, unknown>;

    const terminal = ["ready", "applied", "failed", "canceled"];
    if (!terminal.includes(job.status as string) && job.external_job_id) {
      const { docsieJobStatus, docsieJobResult } = await import("./docsie.server");
      const { data: conn } = await supabase
        .from("integration_connections" as never)
        .select("id, workspace_id")
        .eq("organization_id", job.organization_id as string)
        .eq("provider", "docsie")
        .maybeSingle();
      const connection = conn as { id: string; workspace_id: string | null } | null;

      if (connection) {
        try {
          const auth = await loadAuth(
            supabase as never,
            connection.id,
            connection.workspace_id,
          );
          const status = await docsieJobStatus(
            auth,
            job.external_job_id as string,
          );
          const normalized = (
            status.normalized_status ??
            status.status ??
            ""
          ).toLowerCase();
          const done =
            status.can_poll === false ||
            ["completed", "complete", "success", "succeeded", "done"].includes(
              normalized,
            );
          const failed = ["failed", "error", "canceled", "cancelled"].includes(
            normalized,
          );

          if (failed) {
            const patch = {
              status: "failed",
              error: status.error ?? status.message ?? "Docsie job failed.",
              status_detail: "Failed",
            };
            await supabase
              .from("manual_import_jobs" as never)
              .update(patch as never)
              .eq("id", data.jobId);
            job = { ...job, ...patch };
          } else if (done) {
            const result = await docsieJobResult(
              auth,
              job.external_job_id as string,
            );
            const md = result.markdown ?? "";
            const patch = {
              status: md ? "ready" : "failed",
              progress: md ? 100 : (job.progress as number),
              status_detail: md ? "Ready to review" : "No content returned",
              error: md ? null : "Docsie returned no document content.",
              result_title: result.title ?? markdownTitle(md),
              raw_result: {
                markdown: md,
                title: result.title ?? null,
                data: (result as { data?: unknown }).data ?? null,
                raw: (result as { raw?: unknown }).raw ?? null,
                extras: (result as { extras?: unknown }).extras ?? null,
                images: collectAllImages(md, {
                  data: (result as { data?: unknown }).data ?? null,
                  raw: (result as { raw?: unknown }).raw ?? null,
                  extras: (result as { extras?: unknown }).extras ?? null,
                }),
              },
            };
            await supabase
              .from("manual_import_jobs" as never)
              .update(patch as never)
              .eq("id", data.jobId);
            job = { ...job, ...patch };
          } else {
            const pct = Math.min(
              95,
              Math.max(
                (job.progress as number) ?? 15,
                typeof status.progress === "number" ? status.progress : 0,
              ),
            );
            const patch = {
              status: "processing",
              progress: pct === (job.progress as number) ? Math.min(95, pct + 5) : pct,
              status_detail: status.message ?? "Analyzing video",
            };
            await supabase
              .from("manual_import_jobs" as never)
              .update(patch as never)
              .eq("id", data.jobId);
            job = { ...job, ...patch };
          }
        } catch (e) {
          // Transient polling errors shouldn't kill the job; surface as detail.
          job = { ...job, status_detail: (e as Error).message };
        }
      }
    }

    const md =
      ((job.raw_result as { markdown?: string } | null)?.markdown as string) ?? "";
    const chapters = md
      ? parseDocsieMarkdown(md).map((c) => ({ ...c, suggestedLayout: guessLayout(c) }))
      : [];

    return {
      id: job.id as string,
      status: job.status as ImportJobRow["status"],
      progress: (job.progress as number) ?? 0,
      status_detail: (job.status_detail as string | null) ?? null,
      error: (job.error as string | null) ?? null,
      result_title: (job.result_title as string | null) ?? null,
      manual_id: (job.manual_id as string | null) ?? null,
      product_id: (job.product_id as string | null) ?? null,
      version_id: (job.version_id as string | null) ?? null,
      source_url: job.source_url as string,
      created_at: job.created_at as string,
      chapters,
      imageCount: jobImages(job).length,
      payloadKeys: Object.keys(
        ((job.raw_result as { raw?: unknown } | null)?.raw as Record<
          string,
          unknown
        > | null) ?? {},
      ),
    };
  });

export const cancelImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("manual_import_jobs" as never)
      .update({ status: "canceled", status_detail: "Canceled" } as never)
      .eq("id", data.jobId);
    if (error) throw error;
    return { ok: true as const };
  });

// ---------------- Apply result into the manual draft ----------------

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function importImage(
  versionId: string,
  orgId: string,
  productId: string,
  url: string,
): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/png";
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 15_000_000) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "png";
    const path = `manual-images/${orgId}/${productId}/${versionId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("manual-assets")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) return null;

    const { data: signed } = await supabaseAdmin.storage
      .from("manual-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (!signed?.signedUrl) return null;

    const { data: asset, error } = await supabaseAdmin
      .from("manual_assets")
      .insert({
        manual_version_id: versionId,
        type: "image",
        storage_path: path,
        url: signed.signedUrl,
        metadata: { source: "docsie" },
      })
      .select("id")
      .single();
    if (error || !asset) return null;
    return asset.id as string;
  } catch {
    return null;
  }
}

export const applyVideoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        jobId: uuid,
        chapters: z
          .array(
            z.object({
              key: z.string(),
              title: z.string().max(300),
              layout: z.enum(["one_col", "two_col", "two_row"]),
              include: z.boolean(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: jobRow, error: jErr } = await supabase
      .from("manual_import_jobs" as never)
      .select("*")
      .eq("id", data.jobId)
      .single();
    if (jErr) throw jErr;
    const job = jobRow as unknown as Record<string, unknown>;

    const versionId = job.version_id as string | null;
    const productId = job.product_id as string | null;
    const orgId = job.organization_id as string;
    if (!versionId || !productId) throw new Error("Import job is missing its manual.");

    const md =
      ((job.raw_result as { markdown?: string } | null)?.markdown as string) ?? "";
    if (!md) throw new Error("Nothing to import yet.");

    const parsed = parseDocsieMarkdown(md);
    const byKey = new Map(parsed.map((c) => [c.key, c]));

    const { data: version, error: vErr } = await supabase
      .from("manual_versions")
      .select("id, content, state")
      .eq("id", versionId)
      .single();
    if (vErr) throw vErr;
    if (version.state !== "draft") {
      throw new Error("The manual is no longer a draft.");
    }

    const content = (version.content ?? {}) as unknown as ManualContent;
    const steps: ManualStep[] = Array.isArray(content.steps) ? [...content.steps] : [];

    // Import every frame Docsie returned into the manual's image library,
    // regardless of which sections the user kept, so they can be attached
    // to any step later. Keyed by URL so each file lands once.
    const allImages = collectAllImages(
      md,
      (job.raw_result as { data?: unknown } | null)?.data,
    );
    const assetByUrl = new Map<string, string>();
    for (const url of allImages) {
      const assetId = await importImage(versionId, orgId, productId, url);
      if (assetId) assetByUrl.set(url, assetId);
    }

    for (const choice of data.chapters) {
      if (!choice.include) continue;
      const chapter = byKey.get(choice.key);
      if (!chapter) continue;

      const slotCount = choice.layout === "one_col" ? 1 : 2;
      const slots: StepSlot[] = Array.from({ length: slotCount }, () => ({
        id: newId(),
        text_html: "",
        asset_id: null,
        caption: "",
        callout: null,
      }));

      slots[0].text_html = chapter.html;

      const imageUrl = chapter.images[0];
      if (imageUrl) {
        const assetId =
          assetByUrl.get(imageUrl) ??
          (await importImage(versionId, orgId, productId, imageUrl));
        if (assetId) {
          const target = slotCount > 1 ? slots[1] : slots[0];
          target.asset_id = assetId;
          target.image_width = 100;
        }
      }

      steps.push({
        id: newId(),
        title: choice.title || chapter.title,
        layout: choice.layout,
        slots,
      });
    }

    const nextContent: ManualContent = { ...content, steps };

    const { error: upErr } = await supabase
      .from("manual_versions")
      .update({ content: nextContent as never })
      .eq("id", versionId);
    if (upErr) throw upErr;

    await supabase
      .from("manual_import_jobs" as never)
      .update({ status: "applied", progress: 100, status_detail: "Imported" } as never)
      .eq("id", data.jobId);

    return { ok: true as const, stepCount: steps.length };
  });
