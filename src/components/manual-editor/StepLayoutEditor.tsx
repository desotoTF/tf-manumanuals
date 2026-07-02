// Per-step editor driven by a fixed layout (one column, two columns, two rows).
// Each layout has 1–2 slots; each slot can hold:
//   - rich text  (TipTap)
//   - one image  (asset picker + thumb)
//   - one optional callout
// The generic "add block" menu and free-form block list are intentionally gone.
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  AlertTriangle,
  Bold,
  Columns2,
  Hash,
  Image as ImageIcon,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  Plus,
  Rows2,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_STEP_LAYOUTS,
  STEP_LAYOUT_LABEL,
  changeStepLayout,
  figureToken,
  normalizeStep,
  type ManualStep,
  type StepCallout,
  type StepLayout,
  type StepSlot,
} from "@/lib/types";
import { FigureRefs, type FigureSource } from "@/lib/figure-refs";

interface Props {
  step: ManualStep;
  onChange: (next: ManualStep) => void;
  disabled?: boolean;
  images: FigureSource[];
  figMap: Map<string, number>;
  allowedLayouts?: StepLayout[];
  /** Optional inline upload — when provided, the image picker shows a
   *  "Choose image" tile that uploads on click and auto-selects. */
  onInlineUpload?: (file: File) => Promise<string | null>;
  /** Hide the built-in layout switcher (parent renders its own). */
  hideLayoutSwitcher?: boolean;
}

/** Standalone layout switcher — usable inline in a step header row. */
export function StepLayoutSwitcher({
  step,
  onChange,
  disabled,
  allowedLayouts,
  className,
}: {
  step: ManualStep;
  onChange: (next: ManualStep) => void;
  disabled?: boolean;
  allowedLayouts?: StepLayout[];
  className?: string;
}) {
  const normalized = normalizeStep(step);
  const layout = normalized.layout ?? "two_col";
  const slots = normalized.slots ?? [];
  const allowed = (allowedLayouts && allowedLayouts.length > 0
    ? allowedLayouts
    : ALL_STEP_LAYOUTS) as StepLayout[];
  const switchLayout = (next: StepLayout) => {
    if (next === layout) return;
    const dropping =
      (layout === "two_col" || layout === "two_row") && next === "one_col";
    const slot2 = slots[1];
    const hasContent =
      slot2 && (slot2.text_html || slot2.asset_id || slot2.callout);
    if (dropping && hasContent) {
      if (
        !confirm(
          "Switching to one column will drop the second slot's content. Continue?",
        )
      )
        return;
    }
    onChange(changeStepLayout(normalized, next));
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Layout
      </span>
      <Select
        value={layout}
        onValueChange={(v) => switchLayout(v as StepLayout)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-[170px] text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutIcon layout={layout} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{STEP_LAYOUT_LABEL[layout]}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {allowed.map((l) => (
            <SelectItem key={l} value={l} className="text-xs">
              <span className="flex items-center gap-2">
                <LayoutIcon layout={l} className="h-3.5 w-3.5" />
                {STEP_LAYOUT_LABEL[l]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function StepLayoutEditor({
  step,
  onChange,
  disabled,
  images,
  figMap,
  allowedLayouts,
  onInlineUpload,
  hideLayoutSwitcher,
}: Props) {
  const normalized = useMemo(() => normalizeStep(step), [step]);
  const layout = normalized.layout ?? "two_col";
  const slots = normalized.slots ?? [];

  const updateSlot = (i: number, slot: StepSlot) => {
    const next = slots.slice();
    next[i] = slot;
    onChange({ ...normalized, slots: next });
  };

  const containerCls =
    layout === "two_col"
      ? "grid grid-cols-1 gap-3 md:grid-cols-2"
      : layout === "two_row"
        ? "grid grid-cols-1 gap-3"
        : "grid grid-cols-1 gap-3";

  return (
    <div className="space-y-3">
      {!hideLayoutSwitcher && (
        <StepLayoutSwitcher
          step={normalized}
          onChange={onChange}
          disabled={disabled}
          allowedLayouts={allowedLayouts}
        />
      )}
      <div className={containerCls}>
        {slots.map((slot, i) => (
          <SlotEditor
            key={slot.id}
            slot={slot}
            label={
              layout === "one_col"
                ? "Content"
                : layout === "two_col"
                  ? i === 0
                    ? "Left column"
                    : "Right column"
                  : i === 0
                    ? "Top row"
                    : "Bottom row"
            }
            disabled={disabled}
            images={images}
            figMap={figMap}
            onChange={(s) => updateSlot(i, s)}
            onInlineUpload={onInlineUpload}
          />
        ))}
      </div>
    </div>
  );
}


function LayoutIcon({
  layout,
  className,
}: {
  layout: StepLayout;
  className?: string;
}) {
  if (layout === "one_col") return <Square className={className} />;
  if (layout === "two_col") return <Columns2 className={className} />;
  return <Rows2 className={className} />;
}

// ---- Slot editor ----

function SlotEditor({
  slot,
  label,
  disabled,
  images,
  figMap,
  onChange,
  onInlineUpload,
}: {
  slot: StepSlot;
  label: string;
  disabled?: boolean;
  images: FigureSource[];
  figMap: Map<string, number>;
  onChange: (s: StepSlot) => void;
  onInlineUpload?: (file: File) => Promise<string | null>;
}) {
  const selectedImage = useMemo(
    () => images.find((i) => i.asset_id === slot.asset_id) ?? null,
    [images, slot.asset_id],
  );

  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>

      <RichTextField
        html={slot.text_html}
        onChange={(html) => onChange({ ...slot, text_html: html })}
        disabled={disabled}
        images={images}
        figMap={figMap}
      />

      {/* Image */}
      <div className="mt-3">
        {slot.asset_id ? (
          <div className="flex items-start gap-3 rounded border border-dashed border-border p-2">
            {selectedImage?.url ? (
              <img
                src={selectedImage.url}
                alt={slot.caption ?? ""}
                className="h-20 w-28 rounded object-cover"
              />
            ) : (
              <div className="flex h-20 w-28 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                Image
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <ImagePicker
                images={images}
                value={slot.asset_id}
                disabled={disabled}
                onChange={(id) => onChange({ ...slot, asset_id: id })}
                onInlineUpload={onInlineUpload}
              />
              <Input
                value={slot.caption ?? ""}
                onChange={(e) => onChange({ ...slot, caption: e.target.value })}
                placeholder="Caption (optional)"
                disabled={disabled}
                className="h-8 text-sm"
              />
            </div>
            {!disabled && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange({ ...slot, asset_id: null, caption: "" })}
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          !disabled && (
            <ImagePicker
              images={images}
              value={null}
              disabled={disabled}
              onChange={(id) => onChange({ ...slot, asset_id: id })}
              triggerLabel="Add image"
              onInlineUpload={onInlineUpload}
            />
          )
        )}
      </div>

      {/* Callout */}
      <div className="mt-3">
        {slot.callout ? (
          <CalloutEditor
            callout={slot.callout}
            disabled={disabled}
            onChange={(c) => onChange({ ...slot, callout: c })}
            onRemove={() => onChange({ ...slot, callout: null })}
          />
        ) : (
          !disabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...slot,
                  callout: { severity: "info", body: "" },
                })
              }
            >
              <AlertTriangle className="mr-2 h-4 w-4" /> Add callout
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ---- Image picker (popover with thumbnails) ----

function ImagePicker({
  images,
  value,
  disabled,
  onChange,
  triggerLabel = "Change image",
  onInlineUpload,
}: {
  images: FigureSource[];
  value: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
  triggerLabel?: string;
  onInlineUpload?: (file: File) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!onInlineUpload) return;
    try {
      setUploading(true);
      const newId = await onInlineUpload(file);
      if (newId) {
        onChange(newId);
        setOpen(false);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <ImageIcon className="mr-2 h-4 w-4" /> {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2">
        {onInlineUpload && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await handleFile(f);
              } finally {
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
        )}
        <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto">
          {images.map((img) => {
            const active = img.asset_id === value;
            return (
              <button
                key={img.asset_id}
                type="button"
                onClick={() => {
                  onChange(img.asset_id);
                  setOpen(false);
                }}
                className={cn(
                  "group overflow-hidden rounded border text-left text-xs",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/60",
                )}
              >
                {img.url ? (
                  <img
                    src={img.url}
                    alt=""
                    className="block h-20 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-full items-center justify-center bg-muted text-muted-foreground">
                    no preview
                  </div>
                )}
                <div className="truncate px-2 py-1">
                  {img.caption || img.asset_id.slice(0, 6)}
                </div>
              </button>
            );
          })}
          {onInlineUpload && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex h-[108px] flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary/60 hover:text-primary",
                uploading && "opacity-60",
              )}
            >
              <Plus className="h-5 w-5" />
              {uploading ? "Uploading…" : "Choose image"}
            </button>
          )}
        </div>
        {images.length === 0 && !onInlineUpload && (
          <p className="mt-2 text-xs text-muted-foreground">
            No images yet — upload one from the Images tab.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---- Callout ----

function CalloutEditor({
  callout,
  disabled,
  onChange,
  onRemove,
}: {
  callout: StepCallout;
  disabled?: boolean;
  onChange: (c: StepCallout) => void;
  onRemove: () => void;
}) {
  const Icon =
    callout.severity === "danger"
      ? ShieldAlert
      : callout.severity === "caution"
        ? AlertTriangle
        : Info;
  return (
    <div className="space-y-2 rounded border border-dashed border-border p-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Select
          value={callout.severity}
          onValueChange={(v) =>
            onChange({ ...callout, severity: v as StepCallout["severity"] })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="caution">Caution</SelectItem>
            <SelectItem value="danger">Danger</SelectItem>
          </SelectContent>
        </Select>
        {!disabled && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={onRemove}
            aria-label="Remove callout"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Textarea
        value={callout.body}
        onChange={(e) => onChange({ ...callout, body: e.target.value })}
        placeholder="What does the installer need to be aware of? (##Fig. inserts a figure ref)"
        rows={2}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}

// ---- Rich text field with Fig. picker ----

const FIG_TRIGGER = "##Fig.";
const FIG_TRIGGER_ALT = "@Fig.";

function RichTextField({
  html,
  onChange,
  disabled,
  images,
  figMap,
}: {
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  images: FigureSource[];
  figMap: Map<string, number>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Track whether picker opened from a typed trigger — if so, insert replaces
  // the trigger text, otherwise it just inserts at the caret.
  const triggerActiveRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3, 4] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
      }),
    ],
    content: html || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px]",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const next = ed.getHTML();
      onChange(next === "<p></p>" ? "" : next);

      // Detect ##Fig. / @Fig. trigger at caret.
      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 8), from);
      if (
        textBefore.endsWith(FIG_TRIGGER) ||
        textBefore.endsWith(FIG_TRIGGER_ALT)
      ) {
        triggerActiveRef.current = true;
        setPickerOpen(true);
      }
    },
    immediatelyRender: false,
  });

  useEffect(() => () => editor?.destroy(), [editor]);
  useEffect(() => {
    if (!editor) return;
    if (html !== editor.getHTML())
      editor.commands.setContent(html || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const insertFig = (assetId: string) => {
    if (!editor) return;
    const token = figureToken(assetId);
    if (triggerActiveRef.current) {
      const { from } = editor.state.selection;
      // Find the trigger to delete.
      const before = editor.state.doc.textBetween(Math.max(0, from - 8), from);
      const t = before.endsWith(FIG_TRIGGER)
        ? FIG_TRIGGER
        : before.endsWith(FIG_TRIGGER_ALT)
          ? FIG_TRIGGER_ALT
          : null;
      if (t) {
        editor
          .chain()
          .focus()
          .deleteRange({ from: from - t.length, to: from })
          .insertContent(token)
          .run();
      } else {
        editor.chain().focus().insertContent(token).run();
      }
    } else {
      editor.chain().focus().insertContent(token).run();
    }
    triggerActiveRef.current = false;
    setPickerOpen(false);
  };

  if (!editor) return null;

  const hasTokens = /\{\{fig:[^}]+\}\}|##Fig\.|@Fig\./.test(html);

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Toolbar editor={editor} />
          <Popover
            open={pickerOpen}
            onOpenChange={(o) => {
              setPickerOpen(o);
              if (!o) triggerActiveRef.current = false;
            }}
          >
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-border px-2 text-xs font-normal"
                title="Insert Fig. reference (or type ##Fig.)"
              >
                <Hash className="mr-1 h-3 w-3" /> Fig. ref
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="end">
              <p className="mb-2 text-xs text-muted-foreground">
                Pick an image. Fig. numbers follow the order images appear in
                steps.
              </p>
              {images.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No images yet — upload one from the Images tab.
                </p>
              ) : (
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-auto">
                  {images.map((img) => {
                    const n = figMap.get(img.asset_id);
                    return (
                      <button
                        key={img.asset_id}
                        type="button"
                        onClick={() => insertFig(img.asset_id)}
                        className="overflow-hidden rounded border border-border text-left text-xs hover:border-primary/60"
                      >
                        {img.url ? (
                          <img
                            src={img.url}
                            alt=""
                            className="block h-20 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-full items-center justify-center bg-muted text-muted-foreground">
                            no preview
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-1 px-2 py-1">
                          <span className="font-medium">
                            {n ? `Fig. ${n}` : "Unplaced"}
                          </span>
                          {img.caption && (
                            <span className="truncate text-muted-foreground">
                              {img.caption}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
      <EditorContent editor={editor} />
      {hasTokens && (
        <div className="rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
          <span className="mr-1 font-semibold uppercase tracking-wide">
            Preview
          </span>
          <FigureRefs text={stripHtml(html)} figMap={figMap} />
        </div>
      )}
    </div>
  );
}


function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function Toolbar({ editor }: { editor: Editor }) {
  const TbBtn = ({
    onClick,
    active,
    label,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    label: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-muted-foreground hover:bg-muted",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
  const currentSize = editor.isActive("heading", { level: 3 })
    ? "h3"
    : editor.isActive("heading", { level: 4 })
      ? "h4"
      : "p";
  const setSize = (v: string) => {
    if (v === "p") editor.chain().focus().setParagraph().run();
    else if (v === "h3")
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    else if (v === "h4")
      editor.chain().focus().toggleHeading({ level: 4 }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select value={currentSize} onValueChange={setSize}>
        <SelectTrigger className="h-7 w-[110px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p" className="text-xs">Normal</SelectItem>
          <SelectItem value="h4" className="text-xs">Large</SelectItem>
          <SelectItem value="h3" className="text-xs">Heading</SelectItem>
        </SelectContent>
      </Select>
      <TbBtn
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn
        label="Bulleted list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </TbBtn>
      <TbBtn
        label="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (url === "")
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
          else
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
        }}
      >
        <Link2 className="h-3.5 w-3.5" />
      </TbBtn>
    </div>
  );
}


// Re-export Plus icon to suppress unused-import noise if needed elsewhere.
export { Plus };
