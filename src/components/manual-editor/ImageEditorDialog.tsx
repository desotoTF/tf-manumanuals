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
import { Square, Circle, ArrowRight, Type, Trash2, Crop, Check, X } from "lucide-react";

const MAX_W = 900;
const MAX_H = 560;

function loadImageElement(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for editing"));
    img.src = src;
  });
}

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
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const cropRectRef = useRef<any>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [fill, setFill] = useState("#ff2d55");
  const [stroke, setStroke] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [shadow, setShadow] = useState(0);
  const [noFill, setNoFill] = useState(true);
  const [cropping, setCropping] = useState(false);
  const effectiveFill = () => (noFill ? "transparent" : fill);

  // Mount canvas + load background image when dialog opens.
  useEffect(() => {
    if (!open || !imageUrl) return;
    let cancelled = false;
    setReady(false);
    setCanvasSize(null);
    originalImageRef.current = null;
    (async () => {
      const sourceImage = await loadImageElement(imageUrl);
      if (cancelled || !canvasElRef.current) return;
      const iw = sourceImage.naturalWidth || sourceImage.width || MAX_W;
      const ih = sourceImage.naturalHeight || sourceImage.height || MAX_H;
      const scale = Math.min(MAX_W / iw, MAX_H / ih, 1);
      const cw = Math.round(iw * scale);
      const ch = Math.round(ih * scale);

      originalImageRef.current = sourceImage;
      setCanvasSize({ width: cw, height: ch });

      const canvasEl = canvasElRef.current;
      canvasEl.width = cw;
      canvasEl.height = ch;
      canvasEl.style.width = `${cw}px`;
      canvasEl.style.height = `${ch}px`;

      const fabric = await import("fabric");
      // Force fabric to ignore the device pixel ratio globally for this session.
      // enableRetinaScaling:false on the canvas alone was not enough on hi-DPI
      // displays — the image ended up occupying only 1/4 of the backing store.
      try { (fabric as any).config?.configure?.({ devicePixelRatio: 1 }); } catch {}
      if (cancelled) return;
      const canvas = new fabric.Canvas(canvasEl, {
        selection: true,
        preserveObjectStacking: true,
        enableRetinaScaling: false,
      });
      fabricRef.current = canvas;
      canvas.setDimensions({ width: cw, height: ch });
      if (canvas.wrapperEl) {
        Object.assign(canvas.wrapperEl.style, {
          position: "absolute",
          inset: "0",
          width: `${cw}px`,
          height: `${ch}px`,
        });
      }
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
      fill: effectiveFill(), stroke, strokeWidth,
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
      fill: effectiveFill(), stroke, strokeWidth,
      shadow: s ?? undefined,
    });
    canvas.add(c); canvas.setActiveObject(c); canvas.requestRenderAll();
  };

  const addArrow = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas) return;
    const s = await shadowObj();
    // Arrow as a polyline: shaft + arrowhead grouped. Color comes from the
    // stroke picker (fall back to fill when stroke is transparent) so the
    // Fill/Stroke pickers apply predictably to a mostly-linear shape.
    const w = strokeWidth;
    const arrowColor = stroke && stroke !== "transparent" ? stroke : (noFill ? "#000000" : fill);
    const shaft = new fabric.Line([0, 0, 160, 0], {
      stroke: arrowColor, strokeWidth: w, fill: arrowColor,
    });
    const head = new fabric.Polygon(
      [
        { x: 160, y: 0 },
        { x: 140, y: -10 - w },
        { x: 140, y: 10 + w },
      ],
      { fill: arrowColor, stroke: arrowColor, strokeWidth: 1 },
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
    const applyStyles = (obj: any) => {
      // For grouped shapes (e.g. Arrow = line + polygon) fabric ignores
      // fill/stroke set on the Group itself, so we walk children manually.
      if (typeof obj.forEachObject === "function") {
        obj.forEachObject((child: any) => applyStyles(child));
      } else {
        const isLine = obj.type === "line";
        obj.set({
          fill: isLine ? undefined : effectiveFill(),
          stroke: stroke,
          strokeWidth,
        });
      }
    };
    applyStyles(active);
    active.dirty = true;
    (async () => {
      const s = await shadowObj();
      active.set({ shadow: s ?? null });
      canvas.requestRenderAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill, noFill, stroke, strokeWidth, shadow]);

  // ----- Crop -----
  const startCrop = async () => {
    const { fabric, canvas } = await withFabric();
    if (!canvas || cropping) return;
    const w = canvas.getWidth();
    const h = canvas.getHeight();
    const rect = new fabric.Rect({
      left: w * 0.1,
      top: h * 0.1,
      width: w * 0.8,
      height: h * 0.8,
      fill: "rgba(0,0,0,0.05)",
      stroke: "#ff2d55",
      strokeDashArray: [8, 6],
      strokeWidth: 2,
      cornerColor: "#ff2d55",
      transparentCorners: false,
      hasRotatingPoint: false,
      lockRotation: true,
    });
    cropRectRef.current = rect;
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    setCropping(true);
  };

  const cancelCrop = () => {
    const canvas = fabricRef.current;
    if (canvas && cropRectRef.current) {
      canvas.remove(cropRectRef.current);
      canvas.requestRenderAll();
    }
    cropRectRef.current = null;
    setCropping(false);
  };

  const applyCrop = async () => {
    const canvas = fabricRef.current;
    const sourceImage = originalImageRef.current;
    const rect = cropRectRef.current;
    if (!canvas || !sourceImage || !rect) return;
    const displayWidth = canvasSize?.width || canvas.getWidth();
    const displayHeight = canvasSize?.height || canvas.getHeight();
    const scaleToSource = (sourceImage.naturalWidth || sourceImage.width) / displayWidth;
    // Compute crop in source-image pixels, clamped.
    const sx = Math.max(0, Math.round(rect.left * scaleToSource));
    const sy = Math.max(0, Math.round(rect.top * scaleToSource));
    const sw = Math.min(
      sourceImage.naturalWidth - sx,
      Math.round(rect.width * (rect.scaleX ?? 1) * scaleToSource),
    );
    const sh = Math.min(
      sourceImage.naturalHeight - sy,
      Math.round(rect.height * (rect.scaleY ?? 1) * scaleToSource),
    );
    if (sw <= 4 || sh <= 4) {
      cancelCrop();
      return;
    }
    // Ask before dropping any existing annotations.
    const otherObjs = canvas.getObjects().filter((o: any) => o !== rect);
    if (otherObjs.length > 0 && !confirm("Cropping will remove existing annotations. Continue?")) {
      return;
    }
    const off = document.createElement("canvas");
    off.width = sw;
    off.height = sh;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = off.toDataURL("image/png");
    const newImg = await loadImageElement(dataUrl);
    originalImageRef.current = newImg;

    // Recompute display size at MAX_W/MAX_H.
    const iw = newImg.naturalWidth;
    const ih = newImg.naturalHeight;
    const s = Math.min(MAX_W / iw, MAX_H / ih, 1);
    const cw = Math.round(iw * s);
    const ch = Math.round(ih * s);

    // Reset canvas: clear all, resize, dispose+recreate not needed.
    canvas.clear();
    canvas.setDimensions({ width: cw, height: ch });
    if (canvas.wrapperEl) {
      Object.assign(canvas.wrapperEl.style, {
        width: `${cw}px`,
        height: `${ch}px`,
      });
    }
    setCanvasSize({ width: cw, height: ch });
    if (canvasElRef.current) {
      canvasElRef.current.style.width = `${cw}px`;
      canvasElRef.current.style.height = `${ch}px`;
    }
    cropRectRef.current = null;
    setCropping(false);
    canvas.requestRenderAll();
  };

  const handleSave = async () => {
    const canvas = fabricRef.current;
    const sourceImage = originalImageRef.current;
    if (!canvas || !sourceImage) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
    const displayWidth = canvasSize?.width || canvas.getWidth();
    const exportScale = sourceWidth / displayWidth;

    const output = document.createElement("canvas");
    output.width = sourceWidth;
    output.height = sourceHeight;
    const ctx = output.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight);

    const overlayDataUrl: string = canvas.toDataURL({
      format: "png",
      multiplier: exportScale,
      enableRetinaScaling: false,
    });
    const overlay = await loadImageElement(overlayDataUrl);
    ctx.drawImage(overlay, 0, 0, sourceWidth, sourceHeight);

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) return;
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
            <Button size="sm" variant="outline" onClick={addText} disabled={!ready || cropping}>
              <Type className="mr-1 h-4 w-4" /> Text
            </Button>
            {!cropping ? (
              <Button size="sm" variant="outline" onClick={startCrop} disabled={!ready}>
                <Crop className="mr-1 h-4 w-4" /> Crop
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={applyCrop} disabled={!ready}>
                  <Check className="mr-1 h-4 w-4" /> Apply crop
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelCrop}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={removeSelected} disabled={!ready || cropping}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </div>

          <div className="flex items-end gap-3 ml-auto">
            <div className="space-y-1">
              <Label className="text-xs">Fill</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={fill}
                  onChange={(e) => { setFill(e.target.value); setNoFill(false); }}
                  disabled={noFill}
                  className="h-8 w-12 p-0"
                />
                <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={noFill}
                    onChange={(e) => setNoFill(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  None
                </label>
              </div>
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

        <div className="flex justify-center rounded-md border border-border bg-muted p-2 overflow-auto">
          <div
            className="relative shrink-0"
            style={{ width: canvasSize?.width ?? MAX_W, height: canvasSize?.height ?? MAX_H }}
          >
            <img
              src={imageUrl ?? ""}
              alt="Original image preview"
              draggable={false}
              className="block select-none"
              style={{
                width: canvasSize?.width ?? MAX_W,
                height: canvasSize?.height ?? MAX_H,
                opacity: canvasSize ? 1 : 0,
              }}
            />
            <canvas ref={canvasElRef} />
          </div>
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
