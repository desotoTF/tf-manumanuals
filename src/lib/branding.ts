// Shared branding token shape used by the master template renderer.
// Mirrors the `branding` JSONB column on manual_templates.
import thumperfabLogo from "@/assets/thumperfab-logo.png";

export interface BrandingTokens {
  logo_url: string;
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
  colors: {
    brand: "#E11D2A",
    ink: "#111111",
    muted: "#4B4B4B",
    tableHeaderBg: "#E11D2A",
    tableHeaderFg: "#FFFFFF",
  },
  fonts: {
    heading: "Barlow Condensed",
    body: "Barlow",
    headingWeight: 700,
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
    borderColor: "#111111",
  },
};

export const FONT_CHOICES = [
  "Barlow Condensed",
  "Barlow",
  "Oswald",
  "Bebas Neue",
  "Roboto Condensed",
  "Inter",
  "Roboto",
  "Source Sans 3",
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
