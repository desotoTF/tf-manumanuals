// Curated Google Fonts catalog for manual templates, plus an on-demand loader
// so only the fonts a template actually uses are downloaded.

export type FontCategory = "Modern sans" | "Editorial" | "Technical & condensed" | "Serif" | "System";

export interface CatalogFont {
  family: string;
  category: FontCategory;
  weights: number[];
  google: boolean;
}

const f = (family: string, category: FontCategory, weights: number[], google = true): CatalogFont => ({
  family,
  category,
  weights,
  google,
});

export const FONT_CATALOG: CatalogFont[] = [
  f("Inter", "Modern sans", [400, 500, 600, 700]),
  f("DM Sans", "Modern sans", [400, 500, 600, 700]),
  f("Plus Jakarta Sans", "Modern sans", [400, 500, 600, 700]),
  f("Work Sans", "Modern sans", [400, 500, 600, 700]),
  f("Roboto", "Modern sans", [400, 500, 700]),
  f("Open Sans", "Modern sans", [400, 600, 700]),
  f("Lato", "Modern sans", [400, 700]),
  f("Montserrat", "Modern sans", [400, 500, 600, 700]),
  f("Poppins", "Modern sans", [400, 500, 600, 700]),
  f("Source Sans 3", "Editorial", [400, 600, 700]),
  f("Manrope", "Editorial", [400, 500, 600, 700]),
  f("Figtree", "Editorial", [400, 500, 600, 700]),
  f("Nunito Sans", "Editorial", [400, 600, 700]),
  f("IBM Plex Sans", "Editorial", [400, 500, 600, 700]),
  f("Barlow", "Technical & condensed", [400, 500, 600, 700]),
  f("Barlow Condensed", "Technical & condensed", [500, 600, 700]),
  f("Roboto Condensed", "Technical & condensed", [400, 600, 700]),
  f("Archivo", "Technical & condensed", [400, 500, 600, 700]),
  f("Oswald", "Technical & condensed", [400, 500, 600, 700]),
  f("Bebas Neue", "Technical & condensed", [400]),
  f("Teko", "Technical & condensed", [400, 500, 600, 700]),
  f("Merriweather", "Serif", [400, 700]),
  f("Lora", "Serif", [400, 500, 600, 700]),
  f("Playfair Display", "Serif", [400, 600, 700]),
  f("PT Serif", "Serif", [400, 700]),
  f("Source Serif 4", "Serif", [400, 600, 700]),
  f("Arial", "System", [400, 700], false),
  f("Georgia", "System", [400, 700], false),
];

export const FONT_CATEGORIES: FontCategory[] = [
  "Modern sans",
  "Editorial",
  "Technical & condensed",
  "Serif",
  "System",
];

export function findFont(family: string): CatalogFont | undefined {
  return FONT_CATALOG.find((x) => x.family === family);
}

export function fontStack(family: string, fallback = "system-ui, sans-serif"): string {
  const cat = findFont(family)?.category;
  const generic = cat === "Serif" || family === "Georgia" ? "Georgia, serif" : fallback;
  return `"${family}", ${generic}`;
}

/** Inject a Google Fonts stylesheet for the family (browser only, idempotent). */
export function ensureFontLoaded(family: string): void {
  if (typeof document === "undefined" || !family) return;
  const meta = findFont(family);
  if (meta && !meta.google) return;
  const id = `gf-${family.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const weights = (meta?.weights ?? [400, 600, 700]).join(";");
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
}
