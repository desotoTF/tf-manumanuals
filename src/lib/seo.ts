// Shared public-site SEO helpers: canonical URL, Open Graph/Twitter tags,
// default social image, and optional JSON-LD blocks.
export const SITE_ORIGIN = "https://manumanuals.com";
export const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
export const DEFAULT_TITLE = "ThumperFab — Create manuals that stay current";
export const DEFAULT_DESCRIPTION =
  "Create, publish, and update manuals for products, teams, training, service, and operations. Start free with one fully functional manual.";

type JsonLd = Record<string, unknown>;

export function pageHead(opts: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  jsonLd?: JsonLd[];
}) {
  const url = SITE_ORIGIN + opts.path;
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:type", content: opts.type ?? "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: (opts.jsonLd ?? []).map((j) => ({
      type: "application/ld+json",
      children: JSON.stringify(j),
    })),
  };
}
