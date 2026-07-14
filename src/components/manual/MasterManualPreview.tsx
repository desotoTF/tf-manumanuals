// Branded preview of a manual using the ThumperFab master template.
// The DOM is html2canvas + jsPDF-snapshotted at publish time, so every layout
// value is fixed pixels (816×1056 @ 96dpi = 8.5×11in).
//
// Layout summary:
//   Page 1 — Cover: [SVG header] · Make/Model · Product · SKU · hero image ·
//            centered company footer · right-aligned "Ver. X".
//   Page 2 — Two columns: PARTS (+ Hardware Kit) on the left · TOOLS on the
//            right · BOM images grid spanning both columns · warnings block.
//   Page 3+ — Installation steps under a compact interior header (logo right)
//            with a per-page footer showing SKU · title · page number.
import { useEffect, useMemo, useState } from "react";
import {
  type BrandingHeaderAsset,
  type BrandingTokens,
  mergeBranding,
  resolveHeaderSvgMarkup,
  resolveHeaderSvgUrl,
  resolveLogoSvgMarkup,
  resolveLogoSvgUrl,
  sanitizeSvgMarkup,
} from "@/lib/branding";
import type { ManualContent } from "@/lib/types";
import { normalizeStep } from "@/lib/types";
import { StepLayoutView } from "@/components/manual/StepLayoutView";
import { buildFigureMapFromSteps } from "@/lib/figure-refs";


// Fetch an SVG once and inline it as markup. Inlining sidesteps
// `Content-Disposition: attachment` / CORS quirks that leave `<img>` broken,
// and lets html2canvas rasterize the vector cleanly on every page.
const svgCache = new Map<string, Promise<string>>();
function useInlineSvg(url: string | undefined): string {
  const [markup, setMarkup] = useState("");
  useEffect(() => {
    if (!url) {
      setMarkup("");
      return;
    }
    let cancelled = false;
    let promise = svgCache.get(url);
    if (!promise) {
      promise = fetch(url, { credentials: "omit" })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "");
      svgCache.set(url, promise);
    }
    promise.then((text) => {
      if (!cancelled) setMarkup(text);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return markup;
}

// Compute a wrapper width that matches the SVG's viewBox aspect ratio for a
// given height. Needed because flexbox does not size SVGs proportionally when
// only height is set — the SVG falls back to its 300×150 intrinsic default.
function logoAspectWidth(svgMarkup: string, height: number): number {
  const m = svgMarkup.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) return height;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!w || !h) return height;
  return Math.round(height * (w / h));
}

// Illustrator/Figma-exported SVGs commonly embed a `<style>` block using
// generic class names like `.cls-1`. When multiple such SVGs are inlined
// into the same document their CSS rules collide and stomp each other's
// fills. Rename every class to a unique per-render prefix to isolate them.
let scopeCounter = 0;
function scopeSvgClasses(markup: string): string {
  const styleMatch = markup.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  if (!styleMatch) return markup;
  const classNames = new Set<string>();
  const re = /\.([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(styleMatch[1])) !== null) classNames.add(m[1]);
  if (classNames.size === 0) return markup;
  const prefix = `s${(++scopeCounter).toString(36)}-`;
  let out = markup;
  for (const cls of classNames) {
    const esc = cls.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    out = out.replace(new RegExp(`\\.${esc}(?![\\w-])`, "g"), `.${prefix}${cls}`);
    out = out.replace(new RegExp(`(class\\s*=\\s*"[^"]*?)\\b${esc}\\b`, "g"), `$1${prefix}${cls}`);
    out = out.replace(new RegExp(`(class\\s*=\\s*'[^']*?)\\b${esc}\\b`, "g"), `$1${prefix}${cls}`);
  }
  return out;
}

function inlineSvg(svgMarkup: string, style: string): string {
  const withoutXml = sanitizeSvgMarkup(svgMarkup);
  if (!withoutXml) return "";
  if (!/<svg\b/i.test(withoutXml)) return "";
  const scoped = scopeSvgClasses(withoutXml);
  return scoped.replace(
    /<svg\b([^>]*)>/i,
    `<svg$1 style="${style}" preserveAspectRatio="xMidYMid meet">`,
  );
}

function headerAssetSvg(asset: BrandingHeaderAsset | null | undefined): string {
  if (!asset || asset.type !== "svg") return "";
  return sanitizeSvgMarkup(asset.value);
}

function headerAssetImage(asset: BrandingHeaderAsset | null | undefined): string {
  if (!asset || asset.type !== "image") return "";
  return asset.value;
}

function HeaderAssetView({
  asset,
  svgMarkup,
  alt,
  mode,
}: {
  asset?: BrandingHeaderAsset | null;
  svgMarkup: string;
  alt: string;
  mode: "cover" | "interior";
}) {
  const imageUrl = headerAssetImage(asset);
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt}
        crossOrigin="anonymous"
        style={{
          display: "block",
          height: "100%",
          width: "100%",
          objectFit: "contain",
          objectPosition: mode === "interior" ? "right center" : "center center",
        }}
      />
    );
  }

  return (
    <div
      aria-label={alt}
      style={{ height: "100%", width: "100%" }}
      dangerouslySetInnerHTML={{
        __html: inlineSvg(
          svgMarkup,
          mode === "cover"
            ? "width:100%;height:100%;display:block;background-color:transparent;color:#111827;border-color:transparent"
            : "height:100%;width:100%;display:block;background-color:transparent;color:#111827;border-color:transparent",
        ),
      }}
    />
  );
}


export interface ManualPreviewMeta {
  sku: string;
  name: string;
  variant?: string;
  versionLabel?: string;
}

export type PreviewAssetMap = Record<
  string,
  { url: string | null; caption?: string | null }
>;

// Per-SKU lookup used by the parts table + BOM images grid.
export type PartCatalogLookup = Record<
  string,
  { alias?: string | null; imageUrl?: string | null }
>;

// A, B, ..., Z, AA, AB, ... for hardware-kit REF labels.
function alphaRef(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

const PAGE_W = 816;
const PAGE_H = 1056;
const PAGE_PAD = 48;
const CONTENT_W = PAGE_W - PAGE_PAD * 2;
const RED = "#ED1C24";
const INK = "#000000";
const FONT_HEADING = `"Teko", "Barlow Condensed", system-ui, sans-serif`;
const FONT_BODY = `Arial, Helvetica, sans-serif`;

const WARNING_DEFAULT_TITLES: Record<"info" | "caution" | "danger", string> = {
  info: "INFO",
  caution: "CAUTION",
  danger: "DANGER",
};

export function MasterManualPreview({
  branding: brandingInput,
  meta,
  content,
  assets,
  partCatalog,
  scale = 1,
  pdfSafe = false,
}: {
  branding: unknown;
  meta: ManualPreviewMeta;
  content: ManualContent;
  assets?: PreviewAssetMap;
  partCatalog?: PartCatalogLookup;
  scale?: number;
  pdfSafe?: boolean;
}) {
  const b = useMemo(() => mergeBranding(brandingInput), [brandingInput]);
  const headerSvgFallback = resolveHeaderSvgMarkup(b);
  const logoSvgFallback = resolveLogoSvgMarkup(b);
  const coverHeaderAsset = b.assets.coverHeader;
  const interiorHeaderAsset = b.assets.secondaryHeader;
  const headerSvgUrl = coverHeaderAsset ? undefined : resolveHeaderSvgUrl(b);
  const logoSvgUrl = interiorHeaderAsset ? undefined : resolveLogoSvgUrl(b);
  const headerSvgMarkup = useInlineSvg(headerSvgUrl);
  const logoSvgMarkup = useInlineSvg(logoSvgUrl);
  // Prefer DB-backed template assets. URL fetches are kept only for legacy
  // branding rows; the shipped defaults are inline so deployed mirrors don't
  // depend on Lovable-only asset roots.
  const coverHeaderMarkup = headerAssetSvg(coverHeaderAsset) || headerSvgMarkup || headerSvgFallback;
  const interiorLogoMarkup = headerAssetSvg(interiorHeaderAsset) || logoSvgMarkup || logoSvgFallback;
  const backCoverAsset = b.assets.backCoverLogo;
  const backCoverSvgMarkup = headerAssetSvg(backCoverAsset);
  const backCoverImageUrl = headerAssetImage(backCoverAsset);
  const assetMap = assets ?? {};
  const catalogMap = partCatalog ?? {};
  const figMap = useMemo(
    () => buildFigureMapFromSteps(content.steps),
    [content.steps],
  );

  // Build the ordered list of interior "content pages" so we can render the
  // interior header/footer + page number consistently. Page 1 = cover, page 2
  // = parts/tools/BOM/warnings, page 3+ = one page per step (kept 1:1 with the
  // existing step layout; html2canvas will re-slice as needed if a step
  // overflows).
  const stepsPages = content.steps.length > 0 ? content.steps : [];
  const showDisclaimer = b.disclaimer.show && b.disclaimer.body.trim().length > 0;
  const showBackCover = b.backCover.show;
  const totalPages = 2 + stepsPages.length + (showDisclaimer ? 1 : 0) + (showBackCover ? 1 : 0);
  const disclaimerPageNum = 2 + stepsPages.length + (showDisclaimer ? 1 : 0);
  const backCoverPageNum = totalPages;

  const pageStyle: React.CSSProperties = {
    width: PAGE_W * scale,
    height: PAGE_H * scale,
    margin: pdfSafe ? "0" : "0 auto 24px",
    background: "#fff",
    boxShadow: pdfSafe ? "none" : "0 4px 24px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
    position: "relative",
    color: INK,
    fontFamily: FONT_BODY,
    fontSize: 11,
    lineHeight: 1.35,
    overflow: "hidden",
  };

  return (
      <div className="mm-preview" data-manual-preview="true" style={{ color: INK }}>
      <style>{`
        .mm-preview table { border-collapse: collapse; }
        .mm-preview .tf-tbl { width: 100%; font-family: ${FONT_BODY}; font-size: 11px; }
        .mm-preview .tf-tbl th, .mm-preview .tf-tbl td {
          border: 1px solid ${INK}; padding: 4px 8px; vertical-align: middle;
        }
        .mm-preview .tf-tbl thead th {
          background: ${RED}; color: #fff; font-family: ${FONT_HEADING};
          font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;
          font-size: 13px; text-align: left;
        }
        .mm-preview .tf-tbl .subhead td {
          background: ${INK}; color: #fff; font-family: ${FONT_HEADING};
          font-weight: 600; text-transform: uppercase; text-align: center;
          font-size: 13px;
        }
      `}</style>

      {/* ---------- PAGE 1 · COVER ---------- */}
      <div data-manual-page="true" style={pageStyle}>
        <div style={{ padding: PAGE_PAD * scale, height: "100%", display: "flex", flexDirection: "column" }}>
          {/* SVG header band — inlined so it renders reliably and is captured by html2canvas */}
          <div
            style={{
              width: "100%",
              height: 146 * scale,
              marginBottom: 20 * scale,
              display: "flex",
              alignItems: "flex-start",
              overflow: "hidden",
            }}
          >
            <HeaderAssetView
              asset={coverHeaderAsset}
              svgMarkup={coverHeaderMarkup}
              alt={`${b.footer.companyName} manual header`}
              mode="cover"
            />
          </div>

          {b.cover.tagline.trim() ? (
            <div
              style={{
                fontFamily: FONT_HEADING,
                fontWeight: 500,
                fontSize: 17,
                lineHeight: 1.05,
                color: INK,
                textTransform: "uppercase",
                marginTop: -10 * scale,
                marginBottom: 16 * scale,
                letterSpacing: "0.02em",
              }}
            >
              {b.cover.tagline}
            </div>
          ) : null}


          {/* Title block */}
          <div style={{ marginBottom: 20 * scale }}>
            <div
              style={{
                fontFamily: FONT_HEADING,
                fontWeight: 600,
                fontSize: 32,
                lineHeight: 1.0,
                color: RED,
              }}
            >
              {meta.name}
            </div>
            {meta.variant && (
              <div
                style={{
                  fontFamily: FONT_HEADING,
                  fontWeight: 500,
                  fontSize: 30,
                  lineHeight: 1.05,
                  color: INK,
                  marginTop: 2,
                }}
              >
                {meta.variant}
              </div>
            )}
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 11,
                color: INK,
                marginTop: 6,
                fontWeight: 700,
              }}
            >
              SKU: {meta.sku}
            </div>
          </div>

          {/* Hero image */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 0,
            }}
          >
            {content.hero_image_url ? (
              <img
                src={content.hero_image_url}
                alt={meta.name}
                crossOrigin="anonymous"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            ) : null}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 12 * scale, textAlign: "center" }}>
            <div style={{ fontFamily: "Arial Black, Arial, sans-serif", fontSize: 13, color: INK }}>
              {b.footer.companyName}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK, marginTop: 2 }}>
              {b.footer.address}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK }}>
              Customer Service: {b.footer.phone}
            </div>
            <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: RED, marginTop: 8 }}>
              {b.footer.website}
            </div>
            {meta.versionLabel && (
              <div
                style={{
                  marginTop: 16 * scale,
                  textAlign: "right",
                  fontFamily: FONT_BODY,
                  fontWeight: 700,
                  fontSize: 15,
                  color: INK,
                }}
              >
                {b.cover.versionLabelPrefix} {meta.versionLabel}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- PAGE 2 · PARTS / TOOLS / BOM IMAGES ---------- */}
      <div data-manual-page="true" style={pageStyle}>
        <InteriorFrame meta={meta} branding={b} headerAsset={interiorHeaderAsset} logoSvgMarkup={interiorLogoMarkup} pageNum={2} totalPages={totalPages} scale={scale}>
          {/* Callout above the parts/tools table, always available */}
          {content.parts_page_callout && content.parts_page_callout.body && (
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
              <WarningBlock
                severity={content.parts_page_callout.severity}
                body={content.parts_page_callout.body}
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Left column: Parts + Hardware Kit as one continuous table */}
            <div>
              <SectionHeader>PARTS</SectionHeader>
              <PartsTable
                parts={content.parts}
                hardwareKit={content.hardware_kit}
                catalog={catalogMap}
              />
            </div>

            {/* Right column: Tools */}
            <div>
              <SectionHeader>TOOLS</SectionHeader>
              <ToolsList tools={content.tools} />
            </div>
          </div>

          {/* BOM images grid spanning both columns */}
          {(content.parts.length > 0 || content.hardware_kit.length > 0) && (
            <div style={{ marginTop: 20 }}>
              <BomImagesGrid
                parts={content.parts}
                hardwareKit={content.hardware_kit}
                catalog={catalogMap}
              />
            </div>
          )}

          {/* Extra one-column steps that live on page 2. Overflow continues onto page 3. */}
          {(content.parts_page_steps ?? []).length > 0 && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              {(content.parts_page_steps ?? []).map((raw, i) => {
                const s = normalizeStep(raw);
                return (
                  <div key={s.id ?? i}>
                    {s.title && (
                      <div
                        style={{
                          fontFamily: FONT_HEADING,
                          fontWeight: 600,
                          fontSize: 14,
                          color: INK,
                          marginBottom: 4,
                        }}
                      >
                        {s.title}
                      </div>
                    )}
                    <div style={{ color: INK, fontSize: 12, lineHeight: 1.4 }}>
                      <StepLayoutView step={s} assets={assetMap} figMap={figMap} pdfSafe={pdfSafe} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Warnings block */}
          {content.warnings.length > 0 && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {content.warnings.map((w, i) => (
                <WarningBlock key={i} severity={w.severity} title={w.title} body={w.body} />
              ))}
            </div>
          )}
        </InteriorFrame>
      </div>

      {/* ---------- PAGE 3+ · STEPS ---------- */}
      {stepsPages.map((raw, idx) => {
        const s = normalizeStep(raw);
        const pageNum = 3 + idx;
        return (
          <div key={s.id ?? idx} data-manual-page="true" style={pageStyle}>
            <InteriorFrame meta={meta} branding={b} headerAsset={interiorHeaderAsset} logoSvgMarkup={interiorLogoMarkup} pageNum={pageNum} totalPages={totalPages} scale={scale}>
              {idx === 0 && (
                <div
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 600,
                    fontSize: 24,
                    color: RED,
                    borderBottom: `3px solid ${RED}`,
                    paddingBottom: 4,
                    marginBottom: 12,
                    textTransform: "uppercase",
                  }}
                >
                  Installation
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 600,
                    fontSize: 18,
                    color: INK,
                    marginBottom: 4,
                  }}
                >
                  Step {idx + 1}. {s.title || "Untitled step"}
                </div>
                <div style={{ color: INK, fontSize: 12, lineHeight: 1.4 }}>
                  <StepLayoutView step={s} assets={assetMap} figMap={figMap} pdfSafe={pdfSafe} />
                </div>
              </div>
            </InteriorFrame>
          </div>
        );
      })}

      {/* ---------- DISCLAIMER (2nd to last) ---------- */}
      {showDisclaimer && (
        <div data-manual-page="true" style={pageStyle}>
          <InteriorFrame
            meta={meta}
            branding={b}
            headerAsset={interiorHeaderAsset}
            logoSvgMarkup={interiorLogoMarkup}
            pageNum={disclaimerPageNum}
            totalPages={totalPages}
            scale={scale}
          >
            <div
              style={{
                fontFamily: FONT_HEADING,
                fontWeight: 600,
                fontSize: 24,
                color: RED,
                borderBottom: `3px solid ${RED}`,
                paddingBottom: 4,
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              {b.disclaimer.title}
            </div>
            <div
              style={{
                fontFamily: FONT_BODY,
                fontSize: 11,
                lineHeight: 1.5,
                color: INK,
                textAlign: "justify",
                whiteSpace: "pre-wrap",
              }}
            >
              {b.disclaimer.body}
            </div>
          </InteriorFrame>
        </div>
      )}

      {/* ---------- BACK COVER (last page) ---------- */}
      {showBackCover && (
        <div data-manual-page="true" style={pageStyle}>
          <div
            style={{
              padding: PAGE_PAD * scale,
              height: "100%",
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            {/* Dead-centered logo */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              {backCoverSvgMarkup ? (
                <div
                  style={{ width: "55%", maxWidth: 380 }}
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: scopeSvgClasses(backCoverSvgMarkup).replace(
                      /<svg\b([^>]*)>/i,
                      '<svg$1 style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">',
                    ),
                  }}
                />
              ) : backCoverImageUrl ? (
                <img
                  src={backCoverImageUrl}
                  alt={b.footer.companyName}
                  crossOrigin="anonymous"
                  style={{ width: "55%", maxWidth: 380, height: "auto", display: "block" }}
                />
              ) : null}
            </div>
            {/* Contact info pinned to bottom */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 32 * scale,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: "Arial Black, Arial, sans-serif",
                  fontWeight: 900,
                  fontSize: 14,
                  color: INK,
                }}
              >
                {b.footer.companyName}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK, marginTop: 2 }}>
                {b.footer.address}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: INK }}>
                Customer Service: {b.footer.phone}
              </div>
              <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: RED, marginTop: 14, fontWeight: 700 }}>
                {b.footer.website}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Interior page chrome (header + footer) ----------
function InteriorFrame({
  meta,
  branding,
  headerAsset,
  logoSvgMarkup,
  pageNum,
  totalPages,
  scale,
  children,
}: {
  meta: ManualPreviewMeta;
  branding: BrandingTokens;
  headerAsset?: BrandingHeaderAsset | null;
  logoSvgMarkup: string;
  pageNum: number;
  totalPages: number;
  scale: number;
  children: React.ReactNode;
}) {
  const headerImage = headerAssetImage(headerAsset);
  return (
    <div
      style={{
        padding: PAGE_PAD * scale,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {branding.header.show && (
        <>
          {/* Top header: title block left, logo/SVG right */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: FONT_HEADING,
                  fontWeight: 600,
                  fontSize: 24,
                  color: RED,
                  lineHeight: 1.0,
                }}
              >
                {meta.name}
              </div>
              {meta.variant && (
                <div
                  style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 500,
                    fontSize: 22,
                    color: INK,
                    lineHeight: 1.05,
                    marginTop: 1,
                  }}
                >
                  {meta.variant}
                </div>
              )}
              {branding.header.showSku && (
                <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: INK, marginTop: 4 }}>
                  SKU: {meta.sku}
                </div>
              )}
            </div>
            <div
              aria-hidden
              style={{
                height: 64 * scale,
                width: headerImage
                  ? 72 * scale
                  : Math.max(logoAspectWidth(logoSvgMarkup, 64 * scale), 48 * scale),
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <HeaderAssetView
                asset={headerAsset}
                svgMarkup={logoSvgMarkup}
                alt="Thumper Fab"
                mode="interior"
              />
            </div>
          </div>

          {/* 4px black horizontal line */}
          <div style={{ borderTop: `4px solid ${INK}`, marginTop: 8, marginBottom: 12 }} />
        </>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>

      {/* Footer */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 6,
          borderTop: `1px solid ${INK}`,
          display: "grid",
          gridTemplateColumns: "1fr 2fr 1fr",
          fontFamily: FONT_BODY,
          fontSize: 10,
          color: INK,
        }}
      >
        <div style={{ textAlign: "left" }}>SKU: {meta.sku}</div>
        <div style={{ textAlign: "center" }}>{meta.name} Install Manual</div>
        <div style={{ textAlign: "right" }}>
          Page {pageNum} of {totalPages}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_HEADING,
        fontWeight: 600,
        fontSize: 20,
        color: RED,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
        borderBottom: `3px solid ${RED}`,
        paddingBottom: 3,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function PartsTable({
  parts,
  hardwareKit,
  catalog,
}: {
  parts: { part_number: string; qty: number; description?: string }[];
  hardwareKit: { part_number: string; qty: number; description?: string }[];
  catalog: PartCatalogLookup;
}) {
  const nameFor = (p: { part_number: string; description?: string }) =>
    catalog[p.part_number]?.alias ?? p.description ?? "";
  return (
    <table className="tf-tbl">
      <thead>
        <tr>
          <th style={{ width: 48, textAlign: "center" }}>REF</th>
          <th style={{ width: 48, textAlign: "center" }}>QTY</th>
          <th>HARDWARE</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p, i) => (
          <tr key={`p-${i}`}>
            <td style={{ textAlign: "center", fontWeight: 700 }}>{i + 1}</td>
            <td style={{ textAlign: "center" }}>{p.qty}</td>
            <td>{nameFor(p)}</td>
          </tr>
        ))}
        {hardwareKit.length > 0 && (
          <tr className="subhead">
            <td colSpan={3}>Hardware Kit</td>
          </tr>
        )}
        {hardwareKit.map((p, i) => (
          <tr key={`h-${i}`}>
            <td style={{ textAlign: "center", fontWeight: 700 }}>{alphaRef(i)}</td>
            <td style={{ textAlign: "center" }}>{p.qty}</td>
            <td>{nameFor(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ToolsList({ tools }: { tools: { name: string; spec?: string }[] }) {
  if (tools.length === 0) {
    return <div style={{ fontSize: 11, color: "#777" }}>No tools listed.</div>;
  }
  return (
    <ul
      style={{
        margin: 0,
        paddingLeft: 18,
        fontFamily: FONT_BODY,
        fontSize: 12,
        lineHeight: 1.5,
        color: INK,
      }}
    >
      {tools.map((t, i) => (
        <li key={i}>
          {t.name}
          {t.spec ? ` — ${t.spec}` : ""}
        </li>
      ))}
    </ul>
  );
}

function BomImagesGrid({
  parts,
  hardwareKit,
  catalog,
}: {
  parts: { part_number: string; description?: string }[];
  hardwareKit: { part_number: string; description?: string }[];
  catalog: PartCatalogLookup;
}) {
  const items: { ref: string; part: { part_number: string; description?: string } }[] = [
    ...parts.map((p, i) => ({ ref: String(i + 1), part: p })),
    ...hardwareKit.map((p, i) => ({ ref: alphaRef(i), part: p })),
  ].filter(({ part }) => catalog[part.part_number]?.imageUrl);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}
    >
      {items.map(({ ref, part: p }, i) => {
        const c = catalog[p.part_number];
        return (
          <div
            key={i}
            style={{
              border: `1px dashed ${INK}`,
              padding: 6,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: 72,
            }}
          >
            <div
              style={{
                fontFamily: FONT_HEADING,
                fontWeight: 700,
                fontSize: 22,
                color: INK,
                minWidth: 22,
                textAlign: "center",
              }}
            >
              {ref}
            </div>
            <img
              src={c!.imageUrl!}
              alt={p.description ?? ""}
              crossOrigin="anonymous"
              style={{
                maxWidth: "100%",
                maxHeight: 60,
                objectFit: "contain",
                flex: 1,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

function WarningBlock({
  severity,
  title,
  body,
}: {
  severity: "info" | "caution" | "danger";
  title?: string;
  body: string;
}) {
  const displayTitle = (title?.trim() || WARNING_DEFAULT_TITLES[severity]).toUpperCase();
  const palette =
    severity === "danger"
      ? { bg: RED, titleColor: "#fff", bodyColor: "#fff", border: RED }
      : severity === "caution"
        ? { bg: "#FFF4CE", titleColor: "#8A6100", bodyColor: INK, border: "#E5BC3A" }
        : { bg: "#DFF1FA", titleColor: "#0C5A8F", bodyColor: INK, border: "#7FB8DA" };
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        padding: "8px 14px",
        textAlign: "center",
        maxWidth: 380,
        fontFamily: FONT_BODY,
      }}
    >
      <div
        style={{
          fontFamily: FONT_HEADING,
          fontWeight: 700,
          fontSize: 15,
          color: palette.titleColor,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}
      >
        {displayTitle}
      </div>
      <div style={{ fontSize: 11, color: palette.bodyColor, lineHeight: 1.35 }}>{body}</div>
    </div>
  );
}

