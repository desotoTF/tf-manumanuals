// Canvas image editor built on fabric.js v7. The source image lives INSIDE
// the fabric canvas as its backgroundImage so the on-screen preview, the
// crop math, and the exported PNG all share one coordinate system.
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

function fitDims(iw: number, ih: number) {
  // Always zoom the editable preview to fit the available editor area. Crops
  // often create a smaller bitmap; leaving it at natural pixel size made the
  // post-crop/re-opened view look like a shifted or partial image.
  const scale = Math.min(MAX_W / iw, MAX_H / ih);
  return { width: Math.round(iw * scale), height: Math.round(ih * scale), scale };
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
  // Bitmap currently displayed as the canvas background (may be a cropped
  // derivative of the original). Used as the source-of-truth for save/crop.
  const currentImageRef = useRef<HTMLImageElement | null>(null);
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

  // Set a bitmap as the fabric canvas background, resizing the canvas to
  // the fitted display size. Returns the fabric backgroundImage instance.
  const setBackground = async (img: HTMLImageElement) => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    const fabric = await import("fabric");
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const { width: cw, height: ch, scale } = fitDims(iw, ih);
    const bg = new fabric.FabricImage(img, {
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      scaleX: scale,
      scaleY: scale,
      selectable: false,
      evented: false,
    });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    canvas.set("backgroundImage", bg);
    canvas.setDimensions({ width: cw, height: ch });
    if (canvas.wrapperEl) {
      Object.assign(canvas.wrapperEl.style, {
        width: `${cw}px`,
        height: `${ch}px`,
      });
    }
    if (canvasElRef.current) {
      canvasElRef.current.style.width = `${cw}px`;
      canvasElRef.current.style.height = `${ch}px`;
    }
    setCanvasSize({ width: cw, height: ch });
    currentImageRef.current = img;
    canvas.calcOffset();
    canvas.requestRenderAll();
    return bg;
  };

  // Mount canvas + load background image when dialog opens.
  useEffect(() => {
    if (!open || !imageUrl) return;
    let cancelled = false;
    setReady(false);
    setCanvasSize(null);
    currentImageRef.current = null;
    (async () => {
      const sourceImage = await loadImageElement(imageUrl);
      if (cancelled || !canvasElRef.current) return;
      const { width: cw, height: ch } = fitDims(
        sourceImage.naturalWidth || sourceImage.width || MAX_W,
        sourceImage.naturalHeight || sourceImage.height || MAX_H,
      );

      const canvasEl = canvasElRef.current;
      canvasEl.width = cw;
      canvasEl.height = ch;
      canvasEl.style.width = `${cw}px`;
      canvasEl.style.height = `${ch}px`;

      const fabric = await import("fabric");
      try { (fabric as any).config?.configure?.({ devicePixelRatio: 1 }); } catch {}
      if (cancelled) return;
      const canvas = new fabric.Canvas(canvasEl, {
        selection: true,
        preserveObjectStacking: true,
        enableRetinaScaling: false,
      });
      fabricRef.current = canvas;
      if (canvas.wrapperEl) {
        Object.assign(canvas.wrapperEl.style, {
          position: "absolute",
          inset: "0",
        });
      }
      await setBackground(sourceImage);
      if (cancelled) return;
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
    const value = window.prompt("Enter text", "Text");
    if (value === null) return;
    const content = value.trim() || "Text";
    const s = await shadowObj();
    const t = new fabric.Textbox(content, {
      left: 80,
      top: 80,
      width: Math.max(120, content.length * 18),
      fill: noFill ? "#000000" : fill,
      stroke: strokeWidth > 0 ? stroke : undefined,
      strokeWidth: strokeWidth > 0 ? Math.min(strokeWidth, 2) : 0,
      paintFirst: "stroke",
      fontFamily: "Arial",
      fontSize: 32,
      fontWeight: 700,
      editable: true,
      shadow: s ?? undefined,
    });
    canvas.add(t);
    canvas.setActiveObject(t);
    canvas.requestRenderAll();
  };


  const removeSelected = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objs = canvas.getActiveObjects?.() ?? [];
    objs.forEach((o: any) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject?.();
    if (!active) return;
    const applyStyles = (obj: any) => {
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
      originX: "left",
      originY: "top",
      fill: "rgba(0,0,0,0.05)",
      stroke: "#ff2d55",
      strokeDashArray: [8, 6],
      strokeWidth: 2,
      strokeUniform: true,
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
    const sourceImage = currentImageRef.current;
    const rect = cropRectRef.current;
    if (!canvas || !sourceImage || !rect) return;

    rect.setCoords?.();
    const bounds = rect.getBoundingRect();

    // Convert the actual rendered crop box in canvas coords → source pixels.
    // Using Fabric's bounding box avoids stale left/top/scale values after a
    // user drags resize handles, which was causing the saved crop to shift.
    const sourceW = sourceImage.naturalWidth || sourceImage.width;
    const sourceH = sourceImage.naturalHeight || sourceImage.height;
    const x1 = Math.max(0, Math.min(canvas.getWidth(), bounds.left));
    const y1 = Math.max(0, Math.min(canvas.getHeight(), bounds.top));
    const x2 = Math.max(0, Math.min(canvas.getWidth(), bounds.left + bounds.width));
    const y2 = Math.max(0, Math.min(canvas.getHeight(), bounds.top + bounds.height));
    const kx = sourceW / canvas.getWidth();
    const ky = sourceH / canvas.getHeight();
    const sx = Math.max(0, Math.round(x1 * kx));
    const sy = Math.max(0, Math.round(y1 * ky));
    const sw = Math.min(sourceW - sx, Math.round((x2 - x1) * kx));
    const sh = Math.min(sourceH - sy, Math.round((y2 - y1) * ky));
    if (sw <= 4 || sh <= 4) {
      cancelCrop();
      return;
    }

    // Confirm before dropping annotations.
    const otherObjs = canvas.getObjects().filter((o: any) => o !== rect);
    if (otherObjs.length > 0 && !confirm("Cropping will remove existing annotations. Continue?")) {
      return;
    }

    // Rasterise the crop region from the source bitmap.
    const off = document.createElement("canvas");
    off.width = sw;
    off.height = sh;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = off.toDataURL("image/png");
    const newImg = await loadImageElement(dataUrl);

    // Reset canvas, then swap in the cropped bitmap as the new background.
    canvas.remove(rect);
    otherObjs.forEach((o: any) => canvas.remove(o));
    cropRectRef.current = null;
    setCropping(false);
    await setBackground(newImg);
  };

  const handleSave = async () => {
    const canvas = fabricRef.current;
    const sourceImage = currentImageRef.current;
    if (!canvas || !sourceImage) return;
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
    const out = document.createElement("canvas");
    out.width = sourceWidth;
    out.height = sourceHeight;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight);

    const objects = canvas.getObjects?.() ?? [];
    if (objects.length > 0) {
      const previousBackground = canvas.backgroundImage;
      canvas.set("backgroundImage", undefined);
      canvas.requestRenderAll();
      const multiplier = sourceWidth / canvas.getWidth();
      const overlayUrl: string = canvas.toDataURL({
        format: "png",
        multiplier,
        enableRetinaScaling: false,
      });
      canvas.set("backgroundImage", previousBackground);
      canvas.requestRenderAll();
      const overlay = await loadImageElement(overlayUrl);
      ctx.drawImage(overlay, 0, 0, sourceWidth, sourceHeight);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob(resolve, "image/png"),
    );
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
