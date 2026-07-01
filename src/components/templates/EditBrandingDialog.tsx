// Brand-token editor for the master manual template. Drives logo, colors,
// fonts, header/footer text — every manual renders through these tokens.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  mergeBranding,
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
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="identity">Identity</TabsTrigger>
                <TabsTrigger value="colors">Colors</TabsTrigger>
                <TabsTrigger value="type">Type</TabsTrigger>
                <TabsTrigger value="footer">Footer</TabsTrigger>
              </TabsList>

              <TabsContent value="identity" className="space-y-3 pt-3">
                <Field label="Cover header SVG URL (page 1 banner)">
                  <Input value={b.header_svg_url} onChange={(e) => setB({ ...b, header_svg_url: e.target.value })} placeholder="/__l5e/assets-v1/…/tf-pdf-header.svg" />
                </Field>
                <Field label="Interior logo SVG URL (page 2+ header)">
                  <Input value={b.logo_svg_url} onChange={(e) => setB({ ...b, logo_svg_url: e.target.value })} placeholder="/__l5e/assets-v1/…/tf-pdf-logo.svg" />
                </Field>
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
