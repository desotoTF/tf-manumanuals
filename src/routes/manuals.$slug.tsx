// Legacy public SSR route for a published installation manual (kept so links
// shared before org-branded URLs keep working). Branded URLs: /m/$orgSlug/$slug
import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublishedManualBySlug } from "@/lib/public-manuals.functions";
import { useRecordManualView } from "@/hooks/useRecordManualView";
import { PublicManualView } from "@/components/manual/PublicManualView";

export const Route = createFileRoute("/manuals/$slug")({
  loader: async ({ params }) => {
    const res = await getPublishedManualBySlug({ data: { slug: params.slug } });
    if (!res.product || !res.version) throw notFound();
    const pdfUrl = (res.version as { published_pdf_url?: string | null }).published_pdf_url;
    return { ...res, pdfUrl: pdfUrl ?? null };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.product) {
      return { meta: [{ title: "Manual not found" }, { name: "robots", content: "noindex" }] };
    }
    const desc =
      loaderData.product.description ?? `Manual for ${loaderData.product.name}.`;
    const title = `${loaderData.product.name} — Manual`;
    const org = (loaderData as { org?: { slug?: string } | null }).org;
    const webSlug = (loaderData.product as { web_slug?: string | null }).web_slug;
    // Legacy URL: canonical points at the current /m/<org>/<slug> address.
    const links = org?.slug && webSlug
      ? [{ rel: "canonical", href: `https://manumanuals.com/m/${encodeURIComponent(org.slug)}/${encodeURIComponent(webSlug)}` }]
      : [];
    return {
      links,
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        {
          name: "robots",
          content:
            (loaderData.manual as { visibility?: string } | null)?.visibility === "public_indexed"
              ? "index, follow"
              : "noindex, nofollow",
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">Manual not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Either this product doesn't exist, or no manual has been published yet.
      </p>
    </div>
  ),
  errorComponent: ({ error }: { error: unknown }) => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">Could not load manual</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</p>
    </div>
  ),
  component: PublicManualPage,
});

function PublicManualPage() {
  const { product, version, assets, layout, org, pdfUrl, manual } = Route.useLoaderData();
  useRecordManualView((manual as { id?: string } | null)?.id);
  return (
    <PublicManualView
      product={product!}
      version={version!}
      assets={assets}
      layout={layout}
      brandName={org?.name ?? null}
      pdfUrl={pdfUrl}
    />
  );
}
