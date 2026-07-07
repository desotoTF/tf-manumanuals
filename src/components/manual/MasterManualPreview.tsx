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
  type BrandingTokens,
  mergeBranding,
  resolveHeaderSvgMarkup,
  resolveHeaderSvgUrl,
  resolveLogoSvgMarkup,
  resolveLogoSvgUrl,
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
  const headerSvgUrl = resolveHeaderSvgUrl(b);
  const logoSvgUrl = resolveLogoSvgUrl(b);
  const headerSvgMarkup = useInlineSvg(headerSvgUrl);
  const logoSvgMarkup = useInlineSvg(logoSvgUrl);
  // Prefer the fetched asset (user-uploaded or default template SVG). Only
  // fall back to the inline built-in markup if the fetch failed / returned
  // empty, so the header never renders blank.
  const coverHeaderMarkup = headerSvgMarkup || headerSvgFallback;
  const interiorLogoMarkup = logoSvgMarkup || logoSvgFallback;
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
  const totalPages = 2 + stepsPages.length;

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
            aria-label={b.footer.companyName}
            style={{ width: "100%", marginBottom: 20 * scale }}
            dangerouslySetInnerHTML={{
              __html: coverHeaderMarkup.replace(
                /<svg\b([^>]*)>/i,
                `<svg$1 style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet">`,
              ),
            }}
          />

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
        <InteriorFrame meta={meta} logoSvgMarkup={interiorLogoMarkup} pageNum={2} totalPages={totalPages} scale={scale}>
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
                parts={[...content.parts, ...content.hardware_kit]}
                catalog={catalogMap}
              />
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
            <InteriorFrame meta={meta} logoSvgMarkup={interiorLogoMarkup} pageNum={pageNum} totalPages={totalPages} scale={scale}>
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
    </div>
  );
}

// ---------- Interior page chrome (header + footer) ----------
function InteriorFrame({
  meta,
  logoSvgMarkup,
  pageNum,
  totalPages,
  scale,
  children,
}: {
  meta: ManualPreviewMeta;
  logoSvgMarkup: string;
  pageNum: number;
  totalPages: number;
  scale: number;
  children: React.ReactNode;
}) {
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
      {/* Top header: title block left, logo SVG right */}
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
          <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: INK, marginTop: 4 }}>
            SKU: {meta.sku}
          </div>
        </div>
        <div
          aria-hidden
          style={{
            height: 56 * scale,
            width: logoAspectWidth(logoSvgMarkup, 56 * scale),
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          // Inline the SVG so it renders on every page (no per-request CORS/
          // Content-Disposition surprises) and html2canvas captures it cleanly.
          dangerouslySetInnerHTML={{
            __html: logoSvgMarkup
              ? logoSvgMarkup.replace(
                  /<svg\b([^>]*)>/i,
                  `<svg$1 style="height:100%;width:100%;display:block" preserveAspectRatio="xMidYMid meet">`,
                )
              : "",
          }}
        />

      </div>

      {/* 4px black horizontal line */}
      <div style={{ borderTop: `4px solid ${INK}`, marginTop: 8, marginBottom: 12 }} />

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
            <td style={{ textAlign: "center", fontWeight: 700 }}>{p.part_number}</td>
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
            <td style={{ textAlign: "center", fontWeight: 700 }}>{p.part_number}</td>
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
  catalog,
}: {
  parts: { part_number: string; description?: string }[];
  catalog: PartCatalogLookup;
}) {
  const withImages = parts.filter((p) => catalog[p.part_number]?.imageUrl);
  if (withImages.length === 0) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
      }}
    >
      {withImages.map((p, i) => {
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
              {p.part_number}
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

