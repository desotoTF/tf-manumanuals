// Public SSR route for a published installation manual.
// Renders the latest 'published' manual_version for the product whose web_slug
// matches the URL. Anyone (no auth) can view.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublishedManualBySlug } from "@/lib/public-manuals.functions";
import type { ManualContent } from "@/lib/types";
import { format } from "date-fns";
import { Factory, AlertTriangle, ShieldAlert, Info } from "lucide-react";

export const Route = createFileRoute("/manuals/$slug")({
  loader: async ({ params }) => {
    const res = await getPublishedManualBySlug({ data: { slug: params.slug } });
    if (!res.product || !res.version) throw notFound();
    return res;
  },
  head: ({ loaderData }) => {
    if (!loaderData?.product) return {};
    const desc =
      loaderData.product.description ??
      `Installation manual for ${loaderData.product.name}.`;
    return {
      meta: [
        { title: `${loaderData.product.name} — Installation Manual` },
        { name: "description", content: desc },
        {
          property: "og:title",
          content: `${loaderData.product.name} — Installation Manual`,
        },
        { property: "og:description", content: desc },
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
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">Could not load manual</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  component: PublicManualPage,
});

function PublicManualPage() {
  const { product, version, assets } = Route.useLoaderData();
  const content = (version!.content ?? {}) as Partial<ManualContent>;
  const publishedAt = version!.published_at
    ? format(new Date(version!.published_at), "MMM d, yyyy")
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4 text-sm">
          <Factory className="h-4 w-4 text-primary" />
          <span className="font-medium">ManuManuals</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs text-muted-foreground">
            {product!.sku}
          </span>
        </div>
      </header>

      <article className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {product!.name}
          </h1>
          {product!.description && (
            <p className="mt-2 text-muted-foreground">{product!.description}</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Version {version!.version_number}
            {publishedAt && <> · Published {publishedAt}</>}
          </p>
        </div>

        {content.warnings && content.warnings.length > 0 && (
          <section className="space-y-2">
            {content.warnings.map((w, i) => {
              const map = {
                info: {
                  icon: Info,
                  cls: "border-sky-500/40 bg-sky-500/5 text-sky-700 dark:text-sky-300",
                },
                caution: {
                  icon: AlertTriangle,
                  cls: "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
                },
                danger: {
                  icon: ShieldAlert,
                  cls: "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300",
                },
              }[w.severity];
              const Icon = map.icon;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-md border p-3 text-sm ${map.cls}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{w.body}</p>
                </div>
              );
            })}
          </section>
        )}

        {content.tools && content.tools.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Tools required</h2>
            <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {content.tools.map((t, i) => (
                <li key={i} className="rounded-md border border-border px-3 py-2">
                  <span className="font-medium">{t.name}</span>
                  {t.spec && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t.spec}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {content.parts && content.parts.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Parts list</h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Part #</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {content.parts.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{p.part_number}</td>
                      <td className="px-3 py-2">{p.qty}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {content.steps && content.steps.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Installation steps</h2>
            <ol className="space-y-4">
              {content.steps.map((s, i) => (
                <li
                  key={s.id ?? i}
                  className="rounded-md border border-border p-4"
                >
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Step {i + 1}
                  </div>
                  <h3 className="text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {content.torque_specs && content.torque_specs.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Torque specifications</h2>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fastener</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Sequence</th>
                  </tr>
                </thead>
                <tbody>
                  {content.torque_specs.map((t, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{t.fastener}</td>
                      <td className="px-3 py-2 font-mono">
                        {t.value} {t.unit}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.sequence ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {assets.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Reference images</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {assets
                .filter((a) => a.url)
                .map((a) => (
                  <figure
                    key={a.id}
                    className="overflow-hidden rounded-md border border-border"
                  >
                    <img
                      src={a.url!}
                      alt={(a.metadata as any)?.caption ?? ""}
                      className="aspect-video w-full object-cover"
                      loading="lazy"
                    />
                    {(a.metadata as any)?.caption && (
                      <figcaption className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        {(a.metadata as any).caption}
                      </figcaption>
                    )}
                  </figure>
                ))}
            </div>
          </section>
        )}
      </article>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Powered by ManuManuals
      </footer>
    </div>
  );
}
