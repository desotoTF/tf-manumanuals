// Branded preview of a manual using a template's branding tokens.
// Renders cover + parts/tools/steps/warnings using the template fonts/colors,
// so it matches what the printed PDF will look like.
import { useMemo } from "react";
import { type BrandingTokens, mergeBranding, resolveLogoUrl } from "@/lib/branding";
import type { ManualContent } from "@/lib/types";
import { normalizeStep } from "@/lib/types";
import { StepLayoutView } from "@/components/manual/StepLayoutView";
import { buildFigureMapFromSteps } from "@/lib/figure-refs";

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

// Per-SKU lookup used by the parts table to render friendly alias + image.
export type PartCatalogLookup = Record<
  string,
  { alias?: string | null; imageUrl?: string | null }
>;

export function MasterManualPreview({
  branding: brandingInput,
  meta,
  content,
  assets,
  partCatalog,
  scale = 1,
}: {
  branding: unknown;
  meta: ManualPreviewMeta;
  content: ManualContent;
  assets?: PreviewAssetMap;
  partCatalog?: PartCatalogLookup;
  scale?: number;
}) {
  const b = useMemo(() => mergeBranding(brandingInput), [brandingInput]);
  const logo = resolveLogoUrl(b);
  const assetMap = assets ?? {};
  const catalogMap = partCatalog ?? {};
  const figMap = useMemo(
    () => buildFigureMapFromSteps(content.steps),
    [content.steps],
  );

  // CSS vars on the wrapper let every child read tokens without prop drilling.
  const wrapStyle = {
    "--mm-brand": b.colors.brand,
    "--mm-ink": b.colors.ink,
    "--mm-muted": b.colors.muted,
    "--mm-th-bg": b.colors.tableHeaderBg,
    "--mm-th-fg": b.colors.tableHeaderFg,
    "--mm-border": b.tables.borderColor,
    "--mm-heading-font": `"${b.fonts.heading}", system-ui, sans-serif`,
    "--mm-body-font": `"${b.fonts.body}", system-ui, sans-serif`,
    fontFamily: `var(--mm-body-font)`,
    color: b.colors.ink,
    fontWeight: b.fonts.bodyWeight,
  } as React.CSSProperties;

  const pageBase: React.CSSProperties = {
    width: 816 * scale, // 8.5in @ 96dpi
    minHeight: 1056 * scale, // 11in
    margin: "0 auto 24px",
    padding: 48 * scale,
    background: "white",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  };

  return (
    <div style={wrapStyle} className="mm-preview">
      <style>{`
        .mm-preview h1, .mm-preview h2, .mm-preview h3, .mm-preview .mm-heading {
          font-family: var(--mm-heading-font);
          color: var(--mm-ink);
          letter-spacing: -0.01em;
          line-height: 1.05;
          margin: 0;
        }
        .mm-preview .mm-brand { color: var(--mm-brand); }
        .mm-preview table { border-collapse: collapse; width: 100%; font-size: 13px; }
        .mm-preview th { background: var(--mm-th-bg); color: var(--mm-th-fg);
          text-align: left; padding: 6px 10px; font-family: var(--mm-heading-font); }
        .mm-preview td { padding: 6px 10px; border-top: 1px solid var(--mm-border); }
        .mm-preview .mm-section-h { color: var(--mm-brand); font-size: 22px;
          font-family: var(--mm-heading-font); font-weight: 700;
          border-bottom: 3px solid var(--mm-brand); padding-bottom: 4px; margin: 20px 0 12px; }
      `}</style>

      {/* Cover */}
      <div style={pageBase}>
        <header style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: `1px solid ${b.colors.ink}`, paddingBottom: 12 }}>
          {logo && (
            <img src={logo} alt={b.footer.companyName} style={{ height: 64, objectFit: "contain" }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: `var(--mm-heading-font)`, fontSize: 12, color: b.colors.muted, letterSpacing: "0.04em" }}>
              {b.cover.tagline}
            </div>
          </div>
        </header>

        <div style={{ marginTop: 56 }}>
          <h1 className="mm-brand" style={{ fontSize: 48, fontWeight: 800 }}>{meta.name}</h1>
          {meta.variant && <h2 style={{ fontSize: 32, fontWeight: 700, marginTop: 6 }}>{meta.variant}</h2>}
          <div style={{ marginTop: 12, fontWeight: 700, fontFamily: `var(--mm-heading-font)`, fontSize: 16 }}>
            SKU: {meta.sku}
          </div>
        </div>

        {content.hero_image_url && (
          <div style={{ marginTop: 32, textAlign: "center" }}>
            <img
              src={content.hero_image_url}
              alt={meta.name}
              crossOrigin="anonymous"
              style={{
                maxWidth: "100%",
                maxHeight: 420 * scale,
                objectFit: "contain",
              }}
            />
          </div>
        )}

        <div style={{ marginTop: content.hero_image_url ? 48 : "auto", paddingTop: content.hero_image_url ? 0 : 240, textAlign: "center", color: b.colors.ink }}>
          <div style={{ fontWeight: 700, fontFamily: `var(--mm-heading-font)`, fontSize: 18 }}>{b.footer.companyName}</div>
          <div style={{ marginTop: 4, color: b.colors.muted }}>{b.footer.address}</div>
          <div style={{ color: b.colors.muted }}>Customer Service: {b.footer.phone}</div>
          <div style={{ marginTop: 18 }}>
            <span className="mm-brand" style={{ fontWeight: 700 }}>{b.footer.website}</span>
          </div>
          {meta.versionLabel && (
            <div style={{ marginTop: 24, textAlign: "right", fontWeight: 700 }}>
              {b.cover.versionLabelPrefix} {meta.versionLabel}
            </div>
          )}
        </div>
      </div>

      {/* Inner page */}
      <div style={pageBase}>
        <PageHeader b={b} meta={meta} />

        {content.parts.length > 0 && (
          <>
            <div className="mm-section-h">{b.tables.partsHeaderUppercase ? "PARTS" : "Parts"}</div>
            <PartsTable parts={content.parts} b={b} catalog={catalogMap} />
          </>
        )}

        {content.hardware_kit.length > 0 && (
          <>
            <div className="mm-section-h">{b.tables.partsHeaderUppercase ? "HARDWARE KIT" : "Hardware Kit"}</div>
            <PartsTable parts={content.hardware_kit} b={b} catalog={catalogMap} />
          </>
        )}

        {content.tools.length > 0 && (
          <>
            <div className="mm-section-h">{b.tables.partsHeaderUppercase ? "TOOLS" : "Tools"}</div>
            <ul style={{ columns: 2, columnGap: 32, fontSize: 14, paddingLeft: 18, margin: 0 }}>
              {content.tools.map((t, i) => (
                <li key={i} style={{ breakInside: "avoid" }}>
                  {t.name}{t.spec ? ` — ${t.spec}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}

        {content.warnings.length > 0 && (
          <>
            <div className="mm-section-h">SAFETY</div>
            {content.warnings.map((w, i) => (
              <div key={i} style={{
                borderLeft: `4px solid ${b.colors.brand}`, padding: "8px 12px",
                background: "#FFF5F6", marginBottom: 8, fontSize: 13,
              }}>
                <strong style={{ textTransform: "uppercase", color: b.colors.brand, marginRight: 8 }}>{w.severity}</strong>
                {w.body}
              </div>
            ))}
          </>
        )}

        {content.steps.length > 0 && (
          <>
            <div className="mm-section-h">INSTALLATION</div>
            <ol style={{ paddingLeft: 24, margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              {content.steps.map((raw, idx) => {
                const s = normalizeStep(raw);
                return (
                  <li key={s.id ?? idx} style={{ marginBottom: 18, breakInside: "avoid" }}>
                    <div style={{ fontWeight: 700, fontFamily: `var(--mm-heading-font)`, fontSize: 16, marginBottom: 6 }}>
                      {s.title || `Step ${idx + 1}`}
                    </div>
                    <div style={{ color: b.colors.ink }}>
                      <StepLayoutView step={s} assets={assetMap} figMap={figMap} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <PageFooter b={b} />
      </div>
    </div>
  );
}

function PageHeader({ b, meta }: { b: BrandingTokens; meta: ManualPreviewMeta }) {
  if (!b.header.show) return null;
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
      borderBottom: `2px solid ${b.colors.brand}`, paddingBottom: 8, marginBottom: 16 }}>
      <div>
        <span className="mm-brand" style={{ fontFamily: `var(--mm-heading-font)`, fontWeight: 700, fontSize: 18 }}>{meta.name}</span>
        {meta.variant && <span style={{ marginLeft: 8, fontFamily: `var(--mm-heading-font)`, fontWeight: 600 }}>{meta.variant}</span>}
      </div>
      {b.header.showSku && (
        <div style={{ fontFamily: `var(--mm-heading-font)`, fontWeight: 700, fontSize: 13 }}>SKU: {meta.sku}</div>
      )}
    </header>
  );
}

function PageFooter({ b }: { b: BrandingTokens }) {
  return (
    <footer style={{ marginTop: 32, paddingTop: 8, borderTop: `1px solid ${b.colors.muted}`,
      display: "flex", justifyContent: "space-between", fontSize: 11, color: b.colors.muted }}>
      <span>{b.footer.companyName} · {b.footer.phone}</span>
      <span className="mm-brand" style={{ fontWeight: 700 }}>{b.footer.website}</span>
    </footer>
  );
}

function PartsTable({
  parts,
  b,
  catalog,
}: {
  parts: { part_number: string; qty: number; description?: string }[];
  b: BrandingTokens;
  catalog: PartCatalogLookup;
}) {
  const anyImages = parts.some((p) => catalog[p.part_number]?.imageUrl);
  return (
    <table style={{ marginBottom: 16 }}>
      <thead>
        <tr>
          {anyImages && <th style={{ width: 56 }}></th>}
          <th style={{ width: 60 }}>REF</th>
          <th style={{ width: 60 }}>QTY</th>
          <th>DESCRIPTION</th>
        </tr>
      </thead>
      <tbody>
        {parts.map((p, i) => {
          const c = catalog[p.part_number];
          const name = c?.alias ?? p.description ?? "";
          return (
            <tr key={i} style={b.tables.zebra && i % 2 ? { background: "#F7F7F7" } : undefined}>
              {anyImages && (
                <td style={{ width: 56, padding: 4 }}>
                  {c?.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={name}
                      style={{ width: 48, height: 48, objectFit: "contain", display: "block" }}
                    />
                  ) : null}
                </td>
              )}
              <td>{p.part_number}</td>
              <td>{p.qty}</td>
              <td>{name}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
