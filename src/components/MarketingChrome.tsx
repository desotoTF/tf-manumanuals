// Shared public-site header (with accessible mobile menu) and footer.
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { ManuMark } from "@/components/ManuMark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const PRIMARY = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/features", label: "Features" },
  { to: "/examples", label: "Examples" },
  { to: "/pricing", label: "Pricing" },
] as const;

const SECONDARY = [
  { to: "/guides", label: "Guides" },
  { to: "/help", label: "Help" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Contact" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
] as const;

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`} aria-label="ThumperFab home">
      <ManuMark className="h-6 w-6" />
      ThumperFab
    </Link>
  );
}

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`sticky top-0 z-40 border-b transition-colors ${scrolled ? "border-border bg-background/85 backdrop-blur" : "border-transparent bg-transparent"}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4 text-sm">
        <BrandMark className="text-lg" />
        <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
          {PRIMARY.map((n) => (
            <Link key={n.to} to={n.to} className="text-muted-foreground hover:text-ink" activeProps={{ className: "text-ink font-medium" }}>
              {n.label}
            </Link>
          ))}
          <Link to="/auth" className="text-muted-foreground hover:text-foreground">Sign in</Link>
          <Link to="/signup" className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90">
            Try it free
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <Link to="/signup" className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:bg-primary/90">
            Try it free
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" aria-label="Open menu" className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border hover:bg-accent">
                <Menu className="h-5 w-5" aria-hidden />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle>Menu</SheetTitle>
              <nav aria-label="Mobile" className="mt-6 flex flex-col gap-1 text-base">
                <MobileLink to="/" label="Home" onClick={() => setOpen(false)} />
                {[...PRIMARY, ...SECONDARY].map((n) => (
                  <MobileLink key={n.to} to={n.to} label={n.label} onClick={() => setOpen(false)} />
                ))}
                <div className="my-3 border-t border-border" />
                <MobileLink to="/auth" label="Sign in" onClick={() => setOpen(false)} />
                <Link to="/signup" onClick={() => setOpen(false)} className="mt-2 rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground">
                  Try it free
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MobileLink({ to, label, onClick }: { to: string; label: string; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="rounded-md px-3 py-3 hover:bg-accent" activeProps={{ className: "font-medium" }} activeOptions={{ exact: true }}>
      {label}
    </Link>
  );
}

export function MarketingFooter() {
  const groups: Array<[string, ReadonlyArray<{ to: string; label: string }>]> = [
    ["Product", PRIMARY],
    ["Resources", [{ to: "/guides", label: "Guides" }, { to: "/help", label: "Help" }, { to: "/faq", label: "FAQ" }, { to: "/contact", label: "Contact" }]],
    ["Account", [{ to: "/signup", label: "Try it free" }, { to: "/auth", label: "Sign in" }]],
    ["Legal", [{ to: "/terms", label: "Terms" }, { to: "/privacy", label: "Privacy" }]],
  ];
  return (
    <footer className="border-t border-border bg-paper-soft">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div>
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">Create manuals that stay current.</p>
        </div>
        {groups.map(([h, links]) => (
          <nav key={h} aria-label={h}>
            <p className="eyebrow text-muted-foreground">{h}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map((n) => (
                <li key={n.to}><Link to={n.to} className="text-ink/80 hover:text-primary">{n.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted-foreground">© {new Date().getFullYear()} Ranger State Enterprises LLC. ThumperFab is operated by Ranger State Enterprises LLC.</p>
      </div>
    </footer>
  );
}
