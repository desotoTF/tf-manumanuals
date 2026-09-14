// Server-only helpers for the Docsie "Video to Docs" API.
// Docs: https://app.docsie.io/schema/video/redoc/
const DOCSIE_BASE = "https://app.docsie.io/api_v2/003";

export interface DocsieAuth {
  apiKey: string;
  workspaceId?: string | null;
}

// Docsie deployments differ in how they read the API key. We probe the known
// header shapes once per key and reuse whichever one is accepted.
type Scheme = "token" | "bearer" | "apikey" | "x-api-key";
const SCHEMES: Scheme[] = ["token", "bearer", "apikey", "x-api-key"];
const schemeCache = new Map<string, Scheme>();

function headers(apiKey: string, scheme: Scheme): Record<string, string> {
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (scheme === "token") base.Authorization = `Token ${apiKey}`;
  else if (scheme === "bearer") base.Authorization = `Bearer ${apiKey}`;
  else if (scheme === "apikey") base.apikey = apiKey;
  else base["X-API-KEY"] = apiKey;
  return base;
}

async function attempt(
  path: string,
  apiKey: string,
  scheme: Scheme,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; parsed: unknown; text: string }> {
  const res = await fetch(`${DOCSIE_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: headers(apiKey, scheme),
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, parsed, text };
}

async function request<T>(
  path: string,
  apiKey: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const order = schemeCache.has(apiKey)
    ? [schemeCache.get(apiKey)!, ...SCHEMES.filter((s) => s !== schemeCache.get(apiKey))]
    : SCHEMES;

  let last: { status: number; parsed: unknown; text: string } | null = null;
  for (const scheme of order) {
    const r = await attempt(path, apiKey, scheme, init);
    last = r;
    if (r.status === 401 || r.status === 403) continue; // wrong header shape or bad key
    schemeCache.set(apiKey, scheme);
    if (r.status >= 200 && r.status < 300) return r.parsed as T;
    break; // authenticated but the request itself failed
  }

  const p = last?.parsed as { detail?: string; error?: string } | null;
  const detail = p?.detail ?? p?.error ?? (last?.text ?? "").slice(0, 300);
  throw new Error(
    `Docsie request failed (${last?.status ?? 0}): ${detail || "unknown error"}`,
  );
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
    if (/\(401\)|\(403\)/.test(msg))
      throw new Error(`Key rejected by Docsie — ${msg}`);
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
