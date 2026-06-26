// Shared dnd-kit sortable list primitives + the manual-editor field components
// (Tools combobox, Parts rows, Hardware Kit rows). Keeping these together
// avoids a sprawl of tiny files while the editor still composes from them.
import { useState, useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { ManualContent, ManualPart } from "@/lib/types";
import type { ToolRow } from "@/lib/tools.functions";

// ---------- Sortable row wrapper ----------

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      {children({
        attributes: attributes as unknown as Record<string, unknown>,
        listeners,
      })}
    </div>
  );
}


function DragHandle({
  attributes,
  listeners,
  disabled,
}: {
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...(listeners ?? {})}
      disabled={disabled}
      className={cn(
        "mt-1 flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted",
        disabled && "cursor-not-allowed opacity-40",
      )}
      aria-label="Drag to reorder"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

// ---------- Parts / Hardware rows ----------

export function PartsListEditor({
  items,
  setItems,
  editable,
  emptyHint,
  rowKeyPrefix,
}: {
  items: ManualPart[];
  setItems: (next: ManualPart[]) => void;
  editable: boolean;
  emptyHint: string;
  rowKeyPrefix: string;
}) {
  // Stable per-row keys so dnd-kit can track rows across edits without
  // collisions across multiple lists on one page.
  const rowIds = useMemo(
    () => items.map((_, i) => `${rowKeyPrefix}-${i}`),
    [items, rowKeyPrefix],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = rowIds.indexOf(String(active.id));
    const newIdx = rowIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setItems(arrayMove(items, oldIdx, newIdx));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {items.map((row, i) => (
            <SortableRow key={rowIds[i]} id={rowIds[i]}>
              {(h) => (
                <>
                  <DragHandle
                    attributes={h.attributes}
                    listeners={h.listeners}
                    disabled={!editable}
                  />
                  <Input
                    value={row.part_number ?? ""}
                    placeholder="Part #"
                    disabled={!editable}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...row, part_number: e.target.value };
                      setItems(next);
                    }}
                    className="h-8 max-w-[160px] font-mono text-sm"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={Number.isFinite(row.qty) ? row.qty : 0}
                    placeholder="Qty"
                    disabled={!editable}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...row, qty: Number(e.target.value) || 0 };
                      setItems(next);
                    }}
                    className="h-8 w-20 text-sm"
                  />
                  <Input
                    value={row.description ?? ""}
                    placeholder="Description"
                    disabled={!editable}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...row, description: e.target.value };
                      setItems(next);
                    }}
                    className="h-8 flex-1 text-sm"
                  />
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setItems(items.filter((_, j) => j !== i))
                      }
                      className="text-destructive"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setItems([...items, { part_number: "", qty: 1, description: "" }])
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Add part
        </Button>
      )}
    </div>
  );
}

// ---------- Tools editor (combobox + sortable) ----------

export function ToolsListEditor({
  items,
  setItems,
  editable,
  tools,
  onCreateTool,
  creating,
}: {
  items: ManualContent["tools"];
  setItems: (next: ManualContent["tools"]) => void;
  editable: boolean;
  tools: ToolRow[];
  onCreateTool: (
    name: string,
  ) => Promise<{ id: string; name: string; spec: string | null }>;
  creating: boolean;
}) {
  const rowIds = useMemo(() => items.map((_, i) => `tool-${i}`), [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = rowIds.indexOf(String(active.id));
    const newIdx = rowIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    setItems(arrayMove(items, oldIdx, newIdx));
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No tools yet. Click "Add tool" to start picking from your library.
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          {items.map((row, i) => (
            <SortableRow key={rowIds[i]} id={rowIds[i]}>
              {(h) => (
                <>
                  <DragHandle
                    attributes={h.attributes}
                    listeners={h.listeners}
                    disabled={!editable}
                  />
                  <ToolCombobox
                    value={row.name}
                    onChange={(name, spec) => {
                      const next = [...items];
                      next[i] = { name, spec: spec ?? undefined };
                      setItems(next);
                    }}
                    tools={tools}
                    onCreate={onCreateTool}
                    creating={creating}
                    disabled={!editable}
                  />
                  <Input
                    value={row.spec ?? ""}
                    placeholder="Spec (optional)"
                    disabled={!editable}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...row, spec: e.target.value };
                      setItems(next);
                    }}
                    className="h-8 flex-1 text-sm"
                  />
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setItems(items.filter((_, j) => j !== i))
                      }
                      className="text-destructive"
                      aria-label="Remove tool"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
      {editable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setItems([...items, { name: "" }])}
        >
          <Plus className="mr-2 h-4 w-4" /> Add tool
        </Button>
      )}
    </div>
  );
}

function ToolCombobox({
  value,
  onChange,
  tools,
  onCreate,
  creating,
  disabled,
}: {
  value: string;
  onChange: (name: string, spec?: string | null) => void;
  tools: ToolRow[];
  onCreate: (
    name: string,
  ) => Promise<{ id: string; name: string; spec: string | null }>;
  creating: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const trimmed = search.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  const exact = tools.find((t) => t.name.toLowerCase() === lowerTrimmed);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="sm"
          disabled={disabled}
          className="h-8 w-60 justify-between text-sm font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || "Pick or add a tool…"}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search tools…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {trimmed ? (
                <button
                  type="button"
                  disabled={creating}
                  onClick={async () => {
                    const created = await onCreate(trimmed);
                    onChange(created.name, created.spec);
                    setSearch("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Add &ldquo;{trimmed}&rdquo;
                </button>
              ) : (
                <span className="block px-3 py-2 text-xs text-muted-foreground">
                  Type to search or add a tool.
                </span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {tools.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.name}
                  onSelect={() => {
                    onChange(t.name, t.spec);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.toLowerCase() === t.name.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="truncate">{t.name}</span>
                  {t.spec && (
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {t.spec}
                    </span>
                  )}
                </CommandItem>
              ))}
              {trimmed && !exact && (
                <CommandItem
                  value={`__create_${trimmed}`}
                  onSelect={async () => {
                    const created = await onCreate(trimmed);
                    onChange(created.name, created.spec);
                    setSearch("");
                    setOpen(false);
                  }}
                  disabled={creating}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add &ldquo;{trimmed}&rdquo; to library
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
