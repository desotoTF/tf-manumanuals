// Textarea wrapper that lets the user insert `{{fig:<assetId>}}` tokens.
// - A "Fig. ref" button opens a popover listing every image with its current
//   figure number.
// - Typing `##Fig.` anywhere also opens the popover and replaces that trigger
//   with the chosen token.
// - A small rendered preview shows the live numbering below the textarea so
//   the author can see what readers will read.
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Hash } from "lucide-react";
import { figureToken } from "@/lib/types";
import { FigureRefs, type FigureSource } from "@/lib/figure-refs";

interface Props {
  value: string;
  onChange: (v: string) => void;
  images: FigureSource[];
  figMap: Map<string, number>;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
}

const TRIGGER = "##Fig.";

export function FigureRefField({
  value,
  onChange,
  images,
  figMap,
  disabled,
  rows = 3,
  placeholder,
  className,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // When user types ##Fig. we track the trigger range so we can replace it.
  const triggerRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Detect ##Fig. trigger as the user types.
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const handle = () => {
      const caret = el.selectionStart ?? 0;
      const before = value.slice(0, caret);
      if (before.endsWith(TRIGGER)) {
        triggerRangeRef.current = {
          start: caret - TRIGGER.length,
          end: caret,
        };
        setPickerOpen(true);
      }
    };
    el.addEventListener("keyup", handle);
    return () => el.removeEventListener("keyup", handle);
  }, [value, disabled]);

  const insert = (assetId: string) => {
    const token = figureToken(assetId);
    const el = ref.current;
    const range = triggerRangeRef.current;
    if (range) {
      // Replace the typed ##Fig. trigger.
      const next = value.slice(0, range.start) + token + value.slice(range.end);
      onChange(next);
      // Restore caret after token.
      requestAnimationFrame(() => {
        if (el) {
          const pos = range.start + token.length;
          el.setSelectionRange(pos, pos);
          el.focus();
        }
      });
    } else if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + token + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
        el.focus();
      });
    } else {
      onChange((value ?? "") + token);
    }
    triggerRangeRef.current = null;
    setPickerOpen(false);
  };

  const hasTokens = /\{\{fig:[^}]+\}\}/.test(value);

  return (
    <div className={className}>
      <div className="relative">
        <Textarea
          ref={ref}
          value={value}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            triggerRangeRef.current = null;
            onChange(e.target.value);
          }}
        />
        {!disabled && (
          <Popover
            open={pickerOpen}
            onOpenChange={(o) => {
              setPickerOpen(o);
              if (!o) triggerRangeRef.current = null;
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="absolute right-1 top-1 h-7 px-2 text-xs"
                title="Insert Fig. reference (or type ##Fig.)"
              >
                <Hash className="mr-1 h-3 w-3" /> Fig. ref
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <p className="mb-2 text-xs text-muted-foreground">
                Pick an image to insert a reference. Numbering auto-updates if
                you reorder or remove images.
              </p>
              {images.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No images on this manual yet — add one in the Images tab.
                </p>
              )}
              <ul className="max-h-60 space-y-1 overflow-auto">
                {images.map((img) => {
                  const n = figMap.get(img.asset_id);
                  return (
                    <li key={img.asset_id}>
                      <button
                        type="button"
                        onClick={() => insert(img.asset_id)}
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">Fig. {n}</span>
                        {img.caption && (
                          <span className="ml-1 text-muted-foreground">
                            — {img.caption}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {hasTokens && (
        <div className="mt-1 rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground">
          <span className="mr-1 font-semibold uppercase tracking-wide">
            Preview
          </span>
          <FigureRefs text={value} figMap={figMap} />
        </div>
      )}
    </div>
  );
}
