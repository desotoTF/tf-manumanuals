import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

// Plan-limit errors come from the server as "PLAN_LIMIT:<key>:<message>".
// Show the friendly message plus a link to compare plans.
{
  const t = toast as typeof toast & { __planWrapped?: boolean };
  if (!t.__planWrapped) {
    const orig = toast.error;
    toast.error = ((msg: unknown, opts?: Parameters<typeof orig>[1]) => {
      if (typeof msg === "string") {
        const m = msg.match(/PLAN_LIMIT:[a-z_]+:(.+)$/);
        if (m)
          return orig(m[1], {
            ...opts,
            action: { label: "See plans", onClick: () => window.location.assign("/settings/billing") },
          });
      }
      return orig(msg as string, opts);
    }) as typeof toast.error;
    t.__planWrapped = true;
  }
}

import appCss from "../styles.css?url";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE } from "../lib/seo";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  useEffect(() => {
    document.title = "Page not found — ThumperFab";
  }, []);
  return (
    <div className="mm paper-grid flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <title>Page not found — ThumperFab</title>
      <meta name="robots" content="noindex" />
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
          <Link to="/help" className="ml-4 text-sm text-primary hover:underline">
            Visit the Help center
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="mm paper-grid flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: DEFAULT_TITLE },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "theme-color", content: "#102A43" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Public+Sans:wght@400;500;600;700&display=swap" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@500;600;700;800&family=Bebas+Neue&family=Inter:wght@400;600;700&family=Oswald:wght@400;600;700&family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&family=Teko:wght@400;500;600;700&display=swap",
      },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent as never,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Captured at module load, before the auth client strips tokens from the URL.
const INITIAL_URL_PARTS =
  typeof window !== "undefined" ? window.location.search + window.location.hash : "";
const INITIAL_IS_RECOVERY = /[?&#]type=recovery\b/.test(INITIAL_URL_PARTS);
const INITIAL_RECOVERY_SUFFIX =
  typeof window !== "undefined" && INITIAL_IS_RECOVERY
    ? window.location.search + window.location.hash
    : "";
if (INITIAL_IS_RECOVERY) {
  try { sessionStorage.setItem("mm_recovery", "1"); } catch { /* ignore */ }
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Password recovery links can land on any page (e.g. the site root if the
    // redirect isn't honored). Always send them to the set-new-password form.
    const goReset = () => {
      if (window.location.pathname !== "/auth/reset") {
        window.location.replace(`/auth/reset${INITIAL_RECOVERY_SUFFIX}`);
      }
    };
    if (INITIAL_IS_RECOVERY) goReset();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          goReset();
          return;
        }
        if (
          event !== "SIGNED_IN" &&
          event !== "SIGNED_OUT" &&
          event !== "USER_UPDATED"
        )
          return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
    });
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
