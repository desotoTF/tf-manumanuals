// Shared branding token shape used by the master template renderer.
// Mirrors the `branding` JSONB column on manual_templates.
import thumperfabLogo from "@/assets/thumperfab-logo.png";
import tfPdfHeader from "@/assets/tf-pdf-header.svg.asset.json";
import tfPdfLogo from "@/assets/tf-pdf-logo.svg.asset.json";
import tfPdfHeaderMarkup from "@/assets/tf-pdf-header-2.svg?raw";
import tfPdfLogoMarkup from "@/assets/tf-pdf-logo-2.svg?raw";

export interface BrandingHeaderAsset {
  type: "svg" | "image";
  value: string;
  filename?: string;
  contentType?: string;
}

export interface BrandingTokens {
  logo_url: string;
  // Cover header SVG shown on page 1 (full-width band).
  header_svg_url: string;
  // Compact logo SVG shown right-aligned on interior page headers.
  logo_svg_url: string;
  assets: {
    coverHeader: BrandingHeaderAsset | null;
    secondaryHeader: BrandingHeaderAsset | null;
  };
  colors: {
    brand: string;
    ink: string;
    muted: string;
    tableHeaderBg: string;
    tableHeaderFg: string;
  };
  fonts: {
    heading: string;
    body: string;
    headingWeight: number;
    bodyWeight: number;
  };
  cover: {
    tagline: string;
    showHero: boolean;
    versionLabelPrefix: string;
  };
  header: { show: boolean; showSku: boolean };
  footer: {
    companyName: string;
    address: string;
    phone: string;
    website: string;
  };
  tables: {
    partsHeaderUppercase: boolean;
    zebra: boolean;
    borderColor: string;
  };
  disclaimer: {
    show: boolean;
    title: string;
    body: string;
  };
  backCover: {
    show: boolean;
  };
}

export const DEFAULT_BRANDING: BrandingTokens = {
  logo_url: "",
  header_svg_url: tfPdfHeader.url,
  logo_svg_url: tfPdfLogo.url,
  assets: {
    coverHeader: {
      type: "svg",
      value: tfPdfHeaderMarkup,
      filename: "TF-PDF-Header-2.svg",
      contentType: "image/svg+xml",
    },
    secondaryHeader: {
      type: "svg",
      value: tfPdfLogoMarkup,
      filename: "TF-PDF-Logo-2.svg",
      contentType: "image/svg+xml",
    },
  },
  colors: {
    brand: "#ED1C24",
    ink: "#000000",
    muted: "#4B4B4B",
    tableHeaderBg: "#ED1C24",
    tableHeaderFg: "#FFFFFF",
  },
  fonts: {
    heading: "Teko",
    body: "Arial",
    headingWeight: 600,
    bodyWeight: 400,
  },
  cover: {
    tagline: "Aluminum Audio Roofs • Roll Cages • UTV Accessories",
    showHero: true,
    versionLabelPrefix: "Ver.",
  },
  header: { show: true, showSku: true },
  footer: {
    companyName: "Thumper Fab",
    address: "5103 Elysian Fields Rd, Marshall, TX 75672",
    phone: "903-472-0928",
    website: "www.thumperfab.com",
  },
  tables: {
    partsHeaderUppercase: true,
    zebra: false,
    borderColor: "#000000",
  },
};

export const FONT_CHOICES = [
  "Teko",
  "Barlow Condensed",
  "Barlow",
  "Oswald",
  "Bebas Neue",
  "Roboto Condensed",
  "Inter",
  "Roboto",
  "Source Sans 3",
  "Arial",
];

const DEFAULT_HEADER_SVG_MARKUP = `
${tfPdfHeaderMarkup}`;

const DEFAULT_LOGO_SVG_MARKUP = `
${tfPdfLogoMarkup}`;

function mergeHeaderAssets(
  incoming: Partial<BrandingTokens> | undefined,
): BrandingTokens["assets"] {
  const source = incoming?.assets as Partial<BrandingTokens["assets"]> | undefined;
  return {
    coverHeader:
      source && Object.prototype.hasOwnProperty.call(source, "coverHeader")
        ? source.coverHeader ?? null
        : DEFAULT_BRANDING.assets.coverHeader,
    secondaryHeader:
      source && Object.prototype.hasOwnProperty.call(source, "secondaryHeader")
        ? source.secondaryHeader ?? null
        : DEFAULT_BRANDING.assets.secondaryHeader,
  };
}

export function sanitizeSvgMarkup(markup: string): string {
  return markup
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

export function mergeBranding(b: unknown): BrandingTokens {
  const incoming = (b && typeof b === "object" ? b : {}) as Partial<BrandingTokens>;
  return {
    ...DEFAULT_BRANDING,
    ...incoming,
    assets: mergeHeaderAssets(incoming),
    colors: { ...DEFAULT_BRANDING.colors, ...(incoming.colors ?? {}) },
    fonts: { ...DEFAULT_BRANDING.fonts, ...(incoming.fonts ?? {}) },
    cover: { ...DEFAULT_BRANDING.cover, ...(incoming.cover ?? {}) },
    header: { ...DEFAULT_BRANDING.header, ...(incoming.header ?? {}) },
    footer: { ...DEFAULT_BRANDING.footer, ...(incoming.footer ?? {}) },
    tables: { ...DEFAULT_BRANDING.tables, ...(incoming.tables ?? {}) },
  };
}

export function resolveLogoUrl(b: BrandingTokens): string {
  return b.logo_url?.trim() ? b.logo_url : thumperfabLogo;
}

export function resolveHeaderSvgUrl(b: BrandingTokens): string {
  return b.header_svg_url?.trim() ? b.header_svg_url : tfPdfHeader.url;
}

export function resolveLogoSvgUrl(b: BrandingTokens): string {
  return b.logo_svg_url?.trim() ? b.logo_svg_url : tfPdfLogo.url;
}

// Inline SVG fallback used only if the remote fetch of the header/logo asset
// fails (offline, CORS regression, deleted asset). Guarantees the PDF never
// renders with a blank header band.
export function resolveHeaderSvgMarkup(_b: BrandingTokens): string {
  return DEFAULT_HEADER_SVG_MARKUP;
}

export function resolveLogoSvgMarkup(_b: BrandingTokens): string {
  return DEFAULT_LOGO_SVG_MARKUP;
}
