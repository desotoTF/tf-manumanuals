// Canvas image editor built on fabric.js v7. Loads an image as the canvas
// background, lets the user drop rectangles, circles, arrows, and text on
// top, tune fill/stroke/shadow, then exports the flattened result as a PNG
// blob. Only used in the browser — fabric is dynamically imported so it
// never ships in an SSR bundle.
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Square, Circle, ArrowRight, Type, Trash2 } from "lucide-react";

const MAX_W = 900;
const MAX_H = 560;

export function ImageEditorDialog({
  open,
  onOpenChange,
  imageUrl,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  imageUrl: string | null;
  saving: boolean;
  onSave: (blob: Blob) => Promise<void> | void;
}) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [fill, setFill] = useState("#ff2d55");
  const [stroke, setStroke] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [shadow, setShadow] = useState(0);
  const [noFill, setNoFill] = useState(true);
  const effectiveFill = () => (noFill ? "transparent" : fill);

  // Mount canvas + load background image when dialog opens.
  useEffect(() => {
    if (!open || !imageUrl) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const fabric = await import("fabric");
      if (cancelled || !canvasElRef.current) return;
      const canvas = new fabric.Canvas(canvasElRef.current, {
        selection: true,
        preserveObjectStacking: true,
        enableRetinaScaling: false,
      });
      fabricRef.current = canvas;

      const img = await fabric.FabricImage.fromURL(imageUrl, {
        crossOrigin: "anonymous",
      });
      if (cancelled) return;
      const iw = img.width ?? MAX_W;
      const ih = img.height ?? MAX_H;
      const scale = Math.min(MAX_W / iw, MAX_H / ih, 1);
      const cw = Math.round(iw * scale);
      const ch = Math.round(ih * scale);
      canvas.setDimensions({ width: cw, height: ch });
      img.set({ selectable: false, evented: false, scaleX: scale, scaleY: scale, left: 0, top: 0 });
      canvas.backgroundImage = img;
      canvas.renderAll();
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
  }, [open, imageUrl]);

  const withFabric = async () => {
    const fabric = await import("fabric");
    return { fabric, canvas: fabricRef.current };
  };

  const shadowObj = async () => {
    if (shadow <= 0) return null;
    const { fabric } = await withFabric();
    return new fabric.Shadow({ color: "rgba(0,0,0,0.55)", blur: shadow, offsetX: 2, offsetY: 2 });
  };

  const addRect = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas) return;
    const s = await shadowObj();
    const rect = new fabric.Rect({
      left: 40, top: 40, width: 160, height: 100,
      fill: "transparent", stroke, strokeWidth,
      shadow: s ?? undefined,
    });
    canvas.add(rect); canvas.setActiveObject(rect); canvas.requestRenderAll();
  };

  const addCircle = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas) return;
    const s = await shadowObj();
    const c = new fabric.Circle({
      left: 60, top: 60, radius: 55,
      fill: "transparent", stroke, strokeWidth,
      shadow: s ?? undefined,
    });
    canvas.add(c); canvas.setActiveObject(c); canvas.requestRenderAll();
  };

  const addArrow = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas) return;
    const s = await shadowObj();
    // Arrow as a polyline: shaft + arrowhead grouped
    const w = strokeWidth;
    const shaft = new fabric.Line([0, 0, 160, 0], {
      stroke: fill, strokeWidth: w,
    });
    const head = new fabric.Polygon(
      [
        { x: 160, y: 0 },
        { x: 140, y: -10 - w },
        { x: 140, y: 10 + w },
      ],
      { fill, stroke: fill, strokeWidth: 1 },
    );
    const group = new fabric.Group([shaft, head], {
      left: 60, top: 80, shadow: s ?? undefined,
    });
    canvas.add(group); canvas.setActiveObject(group); canvas.requestRenderAll();
  };

  const addText = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas) return;
    const s = await shadowObj();
    const t = new fabric.IText("Text", {
      left: 80, top: 80,
      fill, stroke, strokeWidth: strokeWidth > 0 ? Math.min(strokeWidth, 2) : 0,
      fontFamily: "Arial", fontSize: 32, fontWeight: 700,
      shadow: s ?? undefined,
    });
    canvas.add(t); canvas.setActiveObject(t); canvas.requestRenderAll();
  };

  const removeSelected = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects?.() ?? [];
    objs.forEach((o: any) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  // Live-update selected object when the style pickers change.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject?.();
    if (!active) return;
    active.set({ fill, stroke, strokeWidth });
    (async () => {
      const s = await shadowObj();
      active.set({ shadow: s ?? null });
      canvas.requestRenderAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill, stroke, strokeWidth, shadow]);

  const handleSave = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const dataUrl: string = canvas.toDataURL({ format: "png", multiplier: 2 });
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    await onSave(blob);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-[980px]">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted/40 p-2">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={addRect} disabled={!ready}>
              <Square className="mr-1 h-4 w-4" /> Rect
            </Button>
            <Button size="sm" variant="outline" onClick={addCircle} disabled={!ready}>
              <Circle className="mr-1 h-4 w-4" /> Circle
            </Button>
            <Button size="sm" variant="outline" onClick={addArrow} disabled={!ready}>
              <ArrowRight className="mr-1 h-4 w-4" /> Arrow
            </Button>
            <Button size="sm" variant="outline" onClick={addText} disabled={!ready}>
              <Type className="mr-1 h-4 w-4" /> Text
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeSelected} disabled={!ready}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>

          <div className="flex items-end gap-3 ml-auto">
            <div className="space-y-1">
              <Label className="text-xs">Fill</Label>
              <Input type="color" value={fill} onChange={(e) => setFill(e.target.value)} className="h-8 w-12 p-0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stroke</Label>
              <Input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} className="h-8 w-12 p-0" />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs">Stroke width: {strokeWidth}px</Label>
              <Slider min={0} max={20} step={1} value={[strokeWidth]} onValueChange={(v) => setStrokeWidth(v[0])} />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-xs">Drop shadow: {shadow}</Label>
              <Slider min={0} max={30} step={1} value={[shadow]} onValueChange={(v) => setShadow(v[0])} />
            </div>
          </div>
        </div>

        <div className="flex justify-center rounded-md border border-border bg-[#f7f7f7] p-2 overflow-auto">
          <canvas ref={canvasElRef} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!ready || saving}>
            {saving ? "Saving…" : "Save edited image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
