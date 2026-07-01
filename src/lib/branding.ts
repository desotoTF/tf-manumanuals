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
