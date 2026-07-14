// Brand-token editor for the master manual template. Drives logo, colors,
// fonts, header/footer text — every manual renders through these tokens.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DEFAULT_BRANDING,
  FONT_CHOICES,
  type BrandingHeaderAsset,
  mergeBranding,
  sanitizeSvgMarkup,
  type BrandingTokens,
} from "@/lib/branding";
import { MasterManualPreview } from "@/components/manual/MasterManualPreview";
import { updateTemplateBranding, type TemplateRow } from "@/lib/templates.functions";

export function EditBrandingDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: TemplateRow | null;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateTemplateBranding);
  const [b, setB] = useState<BrandingTokens>(DEFAULT_BRANDING);

  useEffect(() => {
    if (open && template) setB(mergeBranding(template.branding));
  }, [open, template]);

  const mut = useMutation({
    mutationFn: (branding: BrandingTokens) =>
      update({ data: { id: template!.id, branding: branding as unknown as Record<string, unknown> } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manual-templates"] });
      toast.success("Branding saved");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMeta = useMemo(
    () => ({ sku: "TF292001", name: "CanAm Defender HD11", variant: "Long Travel", versionLabel: "1.0" }),
    [],
  );
  const previewContent = useMemo(
    () => ({
      tools: [{ name: "10mm Socket" }, { name: "15mm Wrench" }, { name: "Loctite" }, { name: "Impact" }],
      parts: [
        { part_number: "1", qty: 1, description: "Front Upper Driver Control Arm" },
        { part_number: "2", qty: 1, description: "Front Upper Passenger Control Arm" },
        { part_number: "3", qty: 1, description: "Front Lower Driver Control Arm" },
      ],
      hardware_kit: [
        { part_number: "A", qty: 2, description: '3/4" Left Hand Thread Heim Joint' },
        { part_number: "B", qty: 2, description: '3/4" Left Hand Thread Jam Nut' },
      ],
      steps: [
        { id: "1", title: "Position vehicle", body: "Lift vehicle and support with jack stands; remove wheels." },
        { id: "2", title: "Remove brake caliper", body: "Use a 15mm socket to remove the 2 bolts fastening the brake caliper." },
      ],
      warnings: [{ severity: "caution" as const, body: "If you do not feel comfortable installing, see your nearest dealer." }],
      torque_specs: [],
      images: [],
    }),
    [],
  );

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Edit master template branding</DialogTitle>
          <DialogDescription>
            Colors, fonts, and footer apply to every manual. The preview on the right updates live.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[minmax(0,420px)_1fr] gap-0 max-h-[calc(90vh-180px)]">
          <div className="overflow-y-auto px-6 py-4 border-r">
            <Tabs defaultValue="identity">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="type">Type</TabsTrigger>
                <TabsTrigger value="footer">Footer</TabsTrigger>
                <TabsTrigger value="legal">Legal</TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="space-y-3 pt-3">
                <HeaderAssetField
                  label="Cover page header"
                  asset={b.assets.coverHeader}
                  fallbackLabel="Built-in ThumperFab header"
                  onChange={(asset) => setB({ ...b, assets: { ...b.assets, coverHeader: asset } })}
                />
                <HeaderAssetField
                  label="Secondary page header"
                  asset={b.assets.secondaryHeader}
                  fallbackLabel="Built-in ThumperFab logo"
                  onChange={(asset) => setB({ ...b, assets: { ...b.assets, secondaryHeader: asset } })}
                />
                <details className="rounded-md border border-border p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">Legacy URL fields</summary>
                  <div className="mt-3 space-y-3">
                    <Field label="Cover header SVG URL">
                      <Input value={b.header_svg_url} onChange={(e) => setB({ ...b, header_svg_url: e.target.value })} placeholder="/__l5e/assets-v1/…/tf-pdf-header.svg" />
                    </Field>
                    <Field label="Interior logo SVG URL">
                      <Input value={b.logo_svg_url} onChange={(e) => setB({ ...b, logo_svg_url: e.target.value })} placeholder="/__l5e/assets-v1/…/tf-pdf-logo.svg" />
                    </Field>
                  </div>
                </details>
                <Field label="Legacy logo URL (leave blank for built-in)">
                  <Input value={b.logo_url} onChange={(e) => setB({ ...b, logo_url: e.target.value })} placeholder="https://…/logo.png" />
                </Field>
                <Field label="Tagline">
                  <Input value={b.cover.tagline} onChange={(e) => setB({ ...b, cover: { ...b.cover, tagline: e.target.value } })} />
                </Field>
                <Field label="Version label prefix">
                  <Input value={b.cover.versionLabelPrefix} onChange={(e) => setB({ ...b, cover: { ...b.cover, versionLabelPrefix: e.target.value } })} />
                </Field>
                <label className="flex items-center gap-2 text-sm pt-2">
                  <input type="checkbox" checked={b.header.show} onChange={(e) => setB({ ...b, header: { ...b.header, show: e.target.checked } })} />
                  Show page header on inner pages
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={b.header.showSku} onChange={(e) => setB({ ...b, header: { ...b.header, showSku: e.target.checked } })} />
                  Show SKU in page header
                </label>
              </TabsContent>

              <TabsContent value="colors" className="space-y-3 pt-3">
                <ColorField label="Brand (titles, accents)" value={b.colors.brand}
                  onChange={(v) => setB({ ...b, colors: { ...b.colors, brand: v } })} />
                <ColorField label="Ink (body text)" value={b.colors.ink}
                  onChange={(v) => setB({ ...b, colors: { ...b.colors, ink: v } })} />
                <ColorField label="Muted (sub-text)" value={b.colors.muted}
                  onChange={(v) => setB({ ...b, colors: { ...b.colors, muted: v } })} />
                <ColorField label="Table header background" value={b.colors.tableHeaderBg}
                  onChange={(v) => setB({ ...b, colors: { ...b.colors, tableHeaderBg: v } })} />
                <ColorField label="Table header text" value={b.colors.tableHeaderFg}
                  onChange={(v) => setB({ ...b, colors: { ...b.colors, tableHeaderFg: v } })} />
                <ColorField label="Table border" value={b.tables.borderColor}
                  onChange={(v) => setB({ ...b, tables: { ...b.tables, borderColor: v } })} />
              </TabsContent>

              <TabsContent value="type" className="space-y-3 pt-3">
                <Field label="Heading font">
                  <Select value={b.fonts.heading} onValueChange={(v) => setB({ ...b, fonts: { ...b.fonts, heading: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_CHOICES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Body font">
                  <Select value={b.fonts.body} onValueChange={(v) => setB({ ...b, fonts: { ...b.fonts, body: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FONT_CHOICES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm pt-2">
                  <input type="checkbox" checked={b.tables.partsHeaderUppercase} onChange={(e) => setB({ ...b, tables: { ...b.tables, partsHeaderUppercase: e.target.checked } })} />
                  Uppercase section headers (PARTS, TOOLS…)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={b.tables.zebra} onChange={(e) => setB({ ...b, tables: { ...b.tables, zebra: e.target.checked } })} />
                  Zebra stripe parts table rows
                </label>
              </TabsContent>

              <TabsContent value="footer" className="space-y-3 pt-3">
                <Field label="Company name">
                  <Input value={b.footer.companyName} onChange={(e) => setB({ ...b, footer: { ...b.footer, companyName: e.target.value } })} />
                </Field>
                <Field label="Address">
                  <Input value={b.footer.address} onChange={(e) => setB({ ...b, footer: { ...b.footer, address: e.target.value } })} />
                </Field>
                <Field label="Phone">
                  <Input value={b.footer.phone} onChange={(e) => setB({ ...b, footer: { ...b.footer, phone: e.target.value } })} />
                </Field>
                <Field label="Website">
                  <Input value={b.footer.website} onChange={(e) => setB({ ...b, footer: { ...b.footer, website: e.target.value } })} />
                </Field>
              </TabsContent>

              <TabsContent value="legal" className="space-y-3 pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={b.disclaimer.show}
                    onChange={(e) => setB({ ...b, disclaimer: { ...b.disclaimer, show: e.target.checked } })}
                  />
                  Include product disclaimer page (2nd to last)
                </label>
                <Field label="Disclaimer title">
                  <Input
                    value={b.disclaimer.title}
                    onChange={(e) => setB({ ...b, disclaimer: { ...b.disclaimer, title: e.target.value } })}
                  />
                </Field>
                <Field label="Disclaimer body">
                  <Textarea
                    rows={14}
                    className="text-xs font-mono"
                    value={b.disclaimer.body}
                    onChange={(e) => setB({ ...b, disclaimer: { ...b.disclaimer, body: e.target.value } })}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm pt-2 border-t">
                  <input
                    type="checkbox"
                    checked={b.backCover.show}
                    onChange={(e) => setB({ ...b, backCover: { ...b.backCover, show: e.target.checked } })}
                  />
                  Include back cover page (Thumper Fab logo + contact info)
                </label>
                <p className="text-xs text-muted-foreground">
                  Back cover uses the company name, address, phone, and website from the Footer tab.
                </p>
              </TabsContent>
            </Tabs>
          </div>

          <div className="overflow-y-auto bg-muted/30 py-4">
            <div style={{ transform: "scale(0.6)", transformOrigin: "top center" }}>
              <MasterManualPreview branding={b} meta={previewMeta} content={previewContent as never} />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate(b)} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save branding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2 items-center">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-xs" />
      </div>
    </div>
  );
}

const MAX_HEADER_ASSET_BYTES = 750_000;

async function fileToHeaderAsset(file: File): Promise<BrandingHeaderAsset> {
  if (file.size > MAX_HEADER_ASSET_BYTES) {
    throw new Error("Header file is too large. Use an SVG or an image under 750 KB.");
  }
  const contentType = file.type || contentTypeFromName(file.name);
  if (contentType === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const value = sanitizeSvgMarkup(await file.text());
    if (!/<svg\b/i.test(value)) throw new Error("That file is not a valid SVG.");
    return { type: "svg", value, filename: file.name, contentType: "image/svg+xml" };
  }
  if (!/^image\/(png|jpe?g|webp)$/i.test(contentType)) {
    throw new Error("Use an SVG, PNG, JPG, or WebP header file.");
  }
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return {
    type: "image",
    value: `data:${contentType};base64,${btoa(binary)}`,
    filename: file.name,
    contentType,
  };
}

function contentTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function HeaderAssetField({
  label,
  asset,
  fallbackLabel,
  onChange,
}: {
  label: string;
  asset: BrandingHeaderAsset | null;
  fallbackLabel: string;
  onChange: (asset: BrandingHeaderAsset | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-upload`;
  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToHeaderAsset(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read header file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-xs">{label}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {asset?.filename ?? fallbackLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            id={inputId}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
          <Button asChild type="button" size="sm" variant="outline" disabled={busy}>
            <label htmlFor={inputId} className="cursor-pointer">
              <Upload className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Reading…" : "Replace"}
            </label>
          </Button>
          {asset && (
            <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label={`Remove ${label}`}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex h-20 items-center justify-center overflow-hidden rounded border bg-white p-2">
        {asset?.type === "svg" ? (
          <div
            className="h-full w-full"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: sanitizeSvgMarkup(asset.value).replace(
                /<svg\b([^>]*)>/i,
                '<svg$1 style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet">',
              ),
            }}
          />
        ) : asset?.type === "image" ? (
          <img src={asset.value} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">{fallbackLabel}</span>
        )}
      </div>
    </div>
  );
}
