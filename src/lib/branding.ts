// Shared branding token shape used by the master template renderer.
// Mirrors the `branding` JSONB column on manual_templates.
import thumperfabLogo from "@/assets/thumperfab-logo.png";
import tfPdfHeader from "@/assets/tf-pdf-header.svg.asset.json";
import tfPdfLogo from "@/assets/tf-pdf-logo.svg.asset.json";

export interface BrandingTokens {
  logo_url: string;
  // Cover header SVG shown on page 1 (full-width band).
  header_svg_url: string;
  // Compact logo SVG shown right-aligned on interior page headers.
  logo_svg_url: string;
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
}

export const DEFAULT_BRANDING: BrandingTokens = {
  logo_url: "",
  header_svg_url: tfPdfHeader.url,
  logo_svg_url: tfPdfLogo.url,
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
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 96" role="img" aria-label="Thumper Fab">
  <rect x="0" y="0" width="720" height="96" fill="#000000"/>
  <path d="M0 0h560l-38 96H0z" fill="#111111"/>
  <path d="M540 0h180v96H502z" fill="#ed1c24"/>
  <text x="34" y="44" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#ffffff" letter-spacing="1">THUMPER<tspan fill="#ed1c24">FAB</tspan></text>
  <text x="36" y="70" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" fill="#ffffff" letter-spacing="1.4">INSTALLATION MANUAL</text>
</svg>`;

const DEFAULT_LOGO_SVG_MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 70" role="img" aria-label="Thumper Fab">
  <text x="0" y="45" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#5b5b5f">THUMPER</text>
  <text x="182" y="45" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#ed1c24">FAB</text>
</svg>`;

function shouldUseBuiltInSvg(url: string | undefined): boolean {
  // Only fall back to hand-drawn inline SVG when there is literally no URL
  // configured. When a real asset URL exists (default template or user
  // upload), we always fetch and inline that SVG so the PDF matches the
  // provided artwork.
  return !url?.trim();
}

export function mergeBranding(b: unknown): BrandingTokens {
  const incoming = (b && typeof b === "object" ? b : {}) as Partial<BrandingTokens>;
  return {
    ...DEFAULT_BRANDING,
    ...incoming,
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

export function resolveHeaderSvgMarkup(b: BrandingTokens): string {
  return shouldUseBuiltInSvg(b.header_svg_url, tfPdfHeader.url, "tf-pdf-header.svg")
    ? DEFAULT_HEADER_SVG_MARKUP
    : "";
}

export function resolveLogoSvgMarkup(b: BrandingTokens): string {
  return shouldUseBuiltInSvg(b.logo_svg_url, tfPdfLogo.url, "tf-pdf-logo.svg")
    ? DEFAULT_LOGO_SVG_MARKUP
    : "";
}
