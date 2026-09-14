// Server-only helpers for the Docsie "Video to Docs" API.
// Docs: https://app.docsie.io/schema/video/redoc/
const DOCSIE_BASE = "https://app.docsie.io/api_v2/003";

export interface DocsieAuth {
  apiKey: string;
  workspaceId?: string | null;
}

function headers(apiKey: string): Record<string, string> {
  // Docsie accepts the key as a Token authorization header; some deployments
  // also read `apikey`. Sending both keeps us compatible either way.
  return {
    Authorization: `Token ${apiKey}`,
    apikey: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function request<T>(
  path: string,
  apiKey: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${DOCSIE_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: headers(apiKey),
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const detail =
      (parsed as { detail?: string; error?: string } | null)?.detail ??
      (parsed as { error?: string } | null)?.error ??
      text.slice(0, 300);
    throw new Error(
      `Docsie request failed (${res.status}): ${detail || res.statusText}`,
    );
  }
  return parsed as T;
}

export interface DocsieSubmitResponse {
  job_id: string;
  status?: string;
  estimated_minimum_cost?: number;
  credits_per_minute?: number;
}

export async function docsieSubmitVideo(
  auth: DocsieAuth,
  opts: { videoUrl: string; title?: string; quality?: string },
): Promise<DocsieSubmitResponse> {
  return request<DocsieSubmitResponse>("/video-to-docs/submit/", auth.apiKey, {
    method: "POST",
    body: {
      video_url: opts.videoUrl,
      mode: "document",
      quality: opts.quality ?? "standard",
      doc_style: "guide",
      language: "en",
      guide_generation_mode: "structured_v2",
      auto_publish_to_knowledge_base: false,
      ...(opts.title ? { book_title: opts.title } : {}),
      ...(auth.workspaceId ? { workspace_id: auth.workspaceId } : {}),
    },
  });
}

export interface DocsieStatusResponse {
  job_id: string;
  status?: string;
  normalized_status?: string;
  can_poll?: boolean;
  progress?: number;
  error?: string | null;
  message?: string | null;
}

export async function docsieJobStatus(
  auth: DocsieAuth,
  jobId: string,
): Promise<DocsieStatusResponse> {
  return request<DocsieStatusResponse>(
    `/video-to-docs/${encodeURIComponent(jobId)}/status/`,
    auth.apiKey,
  );
}

export interface DocsieResultResponse {
  title?: string;
  markdown?: string;
  data?: unknown;
}

export async function docsieJobResult(
  auth: DocsieAuth,
  jobId: string,
): Promise<DocsieResultResponse> {
  return request<DocsieResultResponse>(
    `/video-to-docs/${encodeURIComponent(jobId)}/result/`,
    auth.apiKey,
  );
}

/** Cheap credential check — hits status for a bogus job and treats auth errors as failure. */
export async function docsiePing(auth: DocsieAuth): Promise<void> {
  try {
    await docsieJobStatus(auth, "00000000-0000-0000-0000-000000000000");
  } catch (e) {
    const msg = (e as Error).message;
    if (/\(401\)|\(403\)/.test(msg)) throw new Error("Invalid API key");
    // 404 / 400 means the key was accepted but the job doesn't exist.
    if (!/\(404\)|\(400\)|\(422\)/.test(msg)) throw e;
  }
}

/** Verify a YouTube URL resolves to a public video via oEmbed. */
export async function probeYouTubeUrl(
  url: string,
): Promise<{ ok: boolean; title?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
    if (res.status === 404 || res.status === 401 || res.status === 403) {
      return { ok: false, error: "Video not found or is private." };
    }
    if (!res.ok) return { ok: false, error: `Could not reach YouTube (${res.status}).` };
    const json = (await res.json()) as { title?: string };
    return { ok: true, title: json.title };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
