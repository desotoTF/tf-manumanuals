// Per-step block editor.
//
// Blocks are the modular content units inside a step. Default modules are
// Text (rich), Image, Two-column, and Callout. The set of allowed modules
// can be restricted by the active template (allowedTypes prop). Reordering
// is up/down only — drag is intentionally skipped because the cell editors
// inside a two-column block also need their own focus / pointer behaviour.

import { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  AlertTriangle,
  ChevronDown,
  Image as ImageIcon,
  Info,
  Plus,
  ShieldAlert,
  Trash2,
  Type as TypeIcon,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link2,
  Columns2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ALL_STEP_BLOCK_TYPES,
  STEP_BLOCK_LABEL,
  newStepBlock,
  type CalloutStepBlock,
  type ImageStepBlock,
  type StepBlock,
  type StepBlockType,
  type TextStepBlock,
  type TwoColumnStepBlock,
} from "@/lib/types";

interface ImageOption {
  asset_id: string;
  url?: string | null;
  caption?: string | null;
}

interface Props {
  blocks: StepBlock[];
  onChange: (next: StepBlock[]) => void;
  disabled?: boolean;
  images: ImageOption[];
  allowedTypes?: StepBlockType[];
}

export function StepBlocksEditor({
  blocks,
  onChange,
  disabled,
  images,
  allowedTypes,
}: Props) {
  const allowed = (allowedTypes ?? ALL_STEP_BLOCK_TYPES).filter((t) =>
    // table & figure_row aren't built yet — hide from the menu even if the
    // template lists them. They'll appear once implemented.
    ["text", "image", "two_column", "callout"].includes(t),
  );

  const setBlock = (i: number, b: StepBlock) => {
    const next = blocks.slice();
    next[i] = b;
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(blocks.filter((_, k) => k !== i));
  const add = (type: StepBlockType) => {
    const b = newStepBlock(type);
    if (b) onChange([...blocks, b]);
  };

  return (
    <div className="space-y-2">
      {blocks.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No content blocks yet. Add a block to get started.
        </p>
      )}
      {blocks.map((b, i) => (
        <div
          key={b.id}
          className="rounded-md border border-border bg-card/40 p-2"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {STEP_BLOCK_LABEL[b.type]}
            </span>
            {!disabled && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move block up"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === blocks.length - 1}
                  aria-label="Move block down"
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove(i)}
                  aria-label="Delete block"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <BlockBody
            block={b}
            disabled={disabled}
            images={images}
            onChange={(next) => setBlock(i, next)}
          />
        </div>
      ))}
      {!disabled && allowed.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" /> Add block
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {allowed.map((t) => (
              <DropdownMenuItem key={t} onClick={() => add(t)}>
                <BlockTypeIcon type={t} className="mr-2 h-4 w-4" />
                {STEP_BLOCK_LABEL[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function BlockTypeIcon({
  type,
  className,
}: {
  type: StepBlockType;
  className?: string;
}) {
  switch (type) {
    case "text":
      return <TypeIcon className={className} />;
    case "image":
      return <ImageIcon className={className} />;
    case "two_column":
      return <Columns2 className={className} />;
    case "callout":
      return <AlertTriangle className={className} />;
    default:
      return null;
  }
}

function BlockBody({
  block,
  onChange,
  disabled,
  images,
}: {
  block: StepBlock;
  onChange: (b: StepBlock) => void;
  disabled?: boolean;
  images: ImageOption[];
}) {
  switch (block.type) {
    case "text":
      return (
        <RichTextBlock
          block={block}
          disabled={disabled}
          onChange={onChange as (b: TextStepBlock) => void}
        />
      );
    case "image":
      return (
        <ImageBlockEditor
          block={block}
          disabled={disabled}
          images={images}
          onChange={onChange as (b: ImageStepBlock) => void}
        />
      );
    case "callout":
      return (
        <CalloutBlockEditor
          block={block}
          disabled={disabled}
          onChange={onChange as (b: CalloutStepBlock) => void}
        />
      );
    case "two_column":
      return (
        <TwoColumnBlockEditor
          block={block}
          disabled={disabled}
          images={images}
          onChange={onChange as (b: TwoColumnStepBlock) => void}
        />
      );
    default:
      return null;
  }
}

// ---- Rich text (TipTap) ----

function RichTextBlock({
  block,
  onChange,
  disabled,
  compact,
}: {
  block: TextStepBlock;
  onChange: (b: TextStepBlock) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3, 4] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" },
      }),
    ],
    content: block.html || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring",
          compact ? "min-h-[60px]" : "min-h-[80px]",
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange({ ...block, html: html === "<p></p>" ? "" : html });
    },
    immediatelyRender: false,
  });

  useEffect(() => () => editor?.destroy(), [editor]);
  useEffect(() => {
    if (!editor) return;
    if (block.html !== editor.getHTML()) {
      editor.commands.setContent(block.html || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="flex flex-wrap gap-1">
          <TbBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </TbBtn>
          <TbBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </TbBtn>
          <TbBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            label="Bulleted list"
          >
            <List className="h-3.5 w-3.5" />
          </TbBtn>
          <TbBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            label="Numbered list"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </TbBtn>
          <TbBtn
            onClick={() => {
              const prev = editor.getAttributes("link").href as
                | string
                | undefined;
              const url = window.prompt("Link URL", prev ?? "https://");
              if (url === null) return;
              if (url === "") {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
              } else {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url })
                  .run();
              }
            }}
            active={editor.isActive("link")}
            label="Link"
          >
            <Link2 className="h-3.5 w-3.5" />
          </TbBtn>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function TbBtn({
  children,
  active,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "rounded p-1 text-muted-foreground hover:bg-muted",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---- Image block ----

function ImageBlockEditor({
  block,
  onChange,
  disabled,
  images,
}: {
  block: ImageStepBlock;
  onChange: (b: ImageStepBlock) => void;
  disabled?: boolean;
  images: ImageOption[];
}) {
  const selected = useMemo(
    () => images.find((i) => i.asset_id === block.asset_id) ?? null,
    [images, block.asset_id],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={block.asset_id ?? "__none"}
          onValueChange={(v) =>
            onChange({ ...block, asset_id: v === "__none" ? null : v })
          }
          disabled={disabled || images.length === 0}
        >
          <SelectTrigger className="h-8 w-64 text-sm">
            <SelectValue placeholder="Pick an image" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— No image —</SelectItem>
            {images.map((img) => (
              <SelectItem key={img.asset_id} value={img.asset_id}>
                {img.caption?.trim()
                  ? img.caption
                  : `Image ${img.asset_id.slice(0, 6)}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={block.size ?? "medium"}
          onValueChange={(v) =>
            onChange({ ...block, size: v as ImageStepBlock["size"] })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="full">Full width</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={block.align ?? "center"}
          onValueChange={(v) =>
            onChange({ ...block, align: v as ImageStepBlock["align"] })
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-28 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="center">Center</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {images.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Upload images in the Images tab to use them here.
        </p>
      )}
      <Textarea
        value={block.caption ?? ""}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Optional caption shown beneath the image"
        rows={1}
        disabled={disabled}
        className="text-sm"
      />
      {selected?.url && (
        <div
          className={cn(
            "overflow-hidden rounded border border-dashed border-border",
            block.size === "small" && "max-w-[200px]",
            block.size === "medium" && "max-w-[420px]",
            (block.align ?? "center") === "center" && "mx-auto",
            (block.align ?? "center") === "right" && "ml-auto",
          )}
        >
          <img
            src={selected.url}
            alt={block.caption ?? selected.caption ?? ""}
            className="block h-auto w-full"
          />
        </div>
      )}
    </div>
  );
}

// ---- Callout block ----

function CalloutBlockEditor({
  block,
  onChange,
  disabled,
}: {
  block: CalloutStepBlock;
  onChange: (b: CalloutStepBlock) => void;
  disabled?: boolean;
}) {
  const Icon =
    block.severity === "danger"
      ? ShieldAlert
      : block.severity === "caution"
        ? AlertTriangle
        : Info;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <Select
          value={block.severity}
          onValueChange={(v) =>
            onChange({
              ...block,
              severity: v as CalloutStepBlock["severity"],
            })
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
      </div>
      <Textarea
        value={block.body}
        onChange={(e) => onChange({ ...block, body: e.target.value })}
        placeholder="What does the installer need to be aware of?"
        rows={2}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}

// ---- Two-column block ----
//
// Each cell can be a text or image block. The cell type can be swapped via
// the small selector at the top of each column. The defaults are
// "text | image" because that's what most install steps want.

function TwoColumnBlockEditor({
  block,
  onChange,
  disabled,
  images,
}: {
  block: TwoColumnStepBlock;
  onChange: (b: TwoColumnStepBlock) => void;
  disabled?: boolean;
  images: ImageOption[];
}) {
  const updateCell = (
    side: "left" | "right",
    cell: TextStepBlock | ImageStepBlock,
  ) => onChange({ ...block, [side]: cell });

  const swapCellType = (
    side: "left" | "right",
    nextType: "text" | "image",
  ) => {
    const cur = block[side];
    if (cur.type === nextType) return;
    const fresh = (
      nextType === "text"
        ? newStepBlock("text")
        : newStepBlock("image")
    ) as TextStepBlock | ImageStepBlock;
    updateCell(side, fresh);
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {(["left", "right"] as const).map((side) => {
        const cell = block[side];
        return (
          <div
            key={side}
            className="rounded border border-dashed border-border p-2"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {side === "left" ? "Left column" : "Right column"}
              </span>
              <Select
                value={cell.type}
                onValueChange={(v) =>
                  swapCellType(side, v as "text" | "image")
                }
                disabled={disabled}
              >
                <SelectTrigger className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cell.type === "text" ? (
              <RichTextBlock
                block={cell}
                disabled={disabled}
                compact
                onChange={(c) => updateCell(side, c)}
              />
            ) : (
              <ImageBlockEditor
                block={cell}
                disabled={disabled}
                images={images}
                onChange={(c) => updateCell(side, c)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
