// Browser-side packing/unpacking of portable manual bundles (.manual.zip).
// Format v1:
//   manual.json  { format, formatVersion, exportedAt, title, product, version, content, assets[], cover? }
//   assets/<oldAssetId>.<ext>   image files referenced by content
//   cover.<ext>                 optional cover image
import JSZip from "jszip";

export const BUNDLE_FORMAT = "manual-bundle";
export const BUNDLE_VERSION = 1;

type ExportData = {
  title: string;
  product: { sku: string; name: string; description: string | null };
  version: { number: number; state: string };
  content: Record<string, unknown>;
  assets: { id: string; type: string; url: string | null; metadata: Record<string, unknown> }[];
};

export type BundleManifest = ExportData & {
  format: string;
  formatVersion: number;
  exportedAt: string;
  assetFiles: Record<string, string>; // old asset id -> path in zip
  cover?: string; // path in zip
};

const extFor = (type: string, url: string) => {
  const m = /\.([a-z0-9]{3,4})(?:\?|$)/i.exec(url);
  if (m) return m[1].toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("svg")) return "svg";
  return "jpg";
};

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

export async function buildManualBundle(data: ExportData): Promise<{ blob: Blob; missing: number }> {
  const zip = new JSZip();
  const assetFiles: Record<string, string> = {};
  let missing = 0;
  for (const a of data.assets) {
    if (!a.url) continue;
    const b = await fetchBlob(a.url);
    if (!b) { missing++; continue; }
    const path = `assets/${a.id}.${extFor(b.type, a.url)}`;
    zip.file(path, b);
    assetFiles[a.id] = path;
  }
  let cover: string | undefined;
  const heroUrl = data.content["hero_image_url"];
  if (typeof heroUrl === "string" && heroUrl) {
    const b = await fetchBlob(heroUrl);
    if (b) { cover = `cover.${extFor(b.type, heroUrl)}`; zip.file(cover, b); }
    else missing++;
  }
  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    ...data,
    // Drop links that point back at the source workspace's storage.
    assets: data.assets.map((a) => ({ ...a, url: null })),
    assetFiles,
    cover,
  };
  zip.file("manual.json", JSON.stringify(manifest, null, 2));
  return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), missing };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const bundleFilename = (title: string) =>
  `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "manual"}.manual.zip`;

export async function readManualBundle(file: File) {
  const zip = await JSZip.loadAsync(file);
  const raw = await zip.file("manual.json")?.async("string");
  if (!raw) throw new Error("This file isn't a manual export (manual.json is missing).");
  const manifest = JSON.parse(raw) as BundleManifest;
  if (manifest.format !== BUNDLE_FORMAT) throw new Error("This file isn't a manual export.");
  if (manifest.formatVersion > BUNDLE_VERSION) throw new Error("This export was made by a newer version of the app.");
  return { zip, manifest };
}

export async function zipFileBase64(zip: JSZip, path: string) {
  const f = zip.file(path);
  if (!f) return null;
  return f.async("base64");
}

export const mimeFor = (path: string) => {
  const e = path.split(".").pop()?.toLowerCase();
  return e === "png" ? "image/png" : e === "webp" ? "image/webp" : e === "svg" ? "image/svg+xml" : e === "gif" ? "image/gif" : "image/jpeg";
};

// Replace every string equal to an old asset id with the new id.
export function remapIds(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") {
    if (map.has(value)) return map.get(value)!;
    // Figure tokens like {{fig:<id>}} inside text.
    return value.replace(/\{\{fig:([a-zA-Z0-9_-]+)\}\}/g, (m, id) => (map.has(id) ? `{{fig:${map.get(id)}}}` : m));
  }
  if (Array.isArray(value)) return value.map((v) => remapIds(v, map));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, remapIds(v, map)]));
  return value;
}
