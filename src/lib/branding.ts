// Shared branding token shape used by the master template renderer.
// Mirrors the `branding` JSONB column on manual_templates.
import thumperfabLogo from "@/assets/thumperfab-logo.png";
import tfPdfHeader from "@/assets/tf-pdf-header.svg.asset.json";
import tfPdfLogo from "@/assets/tf-pdf-logo.svg.asset.json";
import tfPdfHeaderMarkup from "@/assets/tf-pdf-header-2.svg?raw";
import tfPdfLogoMarkup from "@/assets/tf-pdf-logo-2.svg?raw";
import tfLogoWordmarkMarkup from "@/assets/tf-logo-wordmark.svg?raw";

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
    backCoverLogo: BrandingHeaderAsset | null;
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
    backCoverLogo: {
      type: "svg",
      value: tfLogoWordmarkMarkup,
      filename: "TF-Logo-w-Text.svg",
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
  disclaimer: {
    show: true,
    title: "PRODUCT DISCLAIMER",
    body: "The installation of products sold or manufactured by Thumper Fabrication, LLC (Thumper Fab) including, but not limited to suspension components such as lift kits, audio roofs, roll cages, frame stiffener kits, and tires that exceed the original specifications for the vehicle, may change the vehicle\u2019s center of gravity and handling characteristics both on- and off-road. You are aware that the installation of tires that are larger than original vehicle specifications may reduce the effectiveness of the braking system. Use of these products may place added stress to the original factory vehicle components which could cause them to weaken or possibly fail. Products sold or manufactured by Thumper Fab are intended for off-road use only. Operation of a vehicle modified with these products on a road could result in serious bodily injury or death, and such operation may violate the laws of your state or municipality. You agree to operate your vehicle exclusively in the manner intended by the vehicle manufacturer. You agree that failure to safely and reasonably operate your vehicle could result in serious bodily injury or death, and that, as a result of installation of this product(s) to your vehicle, extreme care must be taken to prevent vehicle rollover or loss of control, which may be more likely to occur as a result of said modifications. You will avoid unsafe maneuvers, including sudden sharp turns or other abrupt maneuvers, which could make a vehicular accident more likely. You understand that Thumper Fab is not responsible or liable for any damages or any injuries to yourself or your passengers that could occur upon possible accidents due to driver error, incorrect installations, bad judgment, incompatibility with other aftermarket accessories or natural disasters to the fullest extent allowable by law. You will have all vehicle occupants fasten seatbelts, if equipped, and wear proper safety equipment, such as DOT approved helmet and eye protection prior to operating the vehicle. You understand and acknowledge that failure to wear proper safety equipment may increase the risk of serious bodily injury or death to yourself and any passengers. Proper installation of products sold or manufactured by Thumper Fab requires knowledge of the factory recommended procedures for removal and installation of original equipment components. Installation of these products without proper knowledge and experience may affect the performance of these components and the safety of the vehicle and cause serious bodily injury or death. It is strongly recommended that a certified mechanic familiar with the installation of similar components perform the product(s) installation. Prior to installing any products sold or manufactured by Thumper Fab, you will perform or cause to be performed an inspection of their vehicle to confirm its condition is suitable for the installation of these products. A proper inspection of the vehicle includes confirmation that the vehicle has not been in a collision and is free of corrosion. If the vehicle is suspected to have been in a collision or misused, or is otherwise unsuitable for modification, you will not install the product(s). You will continue to inspect the vehicle prior to each use to confirm its condition is suitable for its intended use, and you acknowledge that the failure to do so may result in serious bodily injury or death, as well as damage to the vehicle itself. You will install any warning labels provided with the product so it may be prominently seen by yourself and all passengers. You will notify all passengers of the modifications performed to your vehicle prior to operation. Insurance companies may handle coverage of a modified vehicle differently. Please check with your insurance carrier prior to modifying the vehicle to ensure your coverage remains sufficient. Installation of this product(s) may void your vehicle warranty. If this is a concern, please check with the manufacturer or dealer before purchase or installation of this product(s).",
  },
  backCover: {
    show: true,
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
    backCoverLogo:
      source && Object.prototype.hasOwnProperty.call(source, "backCoverLogo")
        ? source.backCoverLogo ?? null
        : DEFAULT_BRANDING.assets.backCoverLogo,
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
    disclaimer: { ...DEFAULT_BRANDING.disclaimer, ...(incoming.disclaimer ?? {}) },
    backCover: { ...DEFAULT_BRANDING.backCover, ...(incoming.backCover ?? {}) },
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
