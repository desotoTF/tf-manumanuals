// Figure numbering + `{{fig:...}}` / `##Fig.` / `@Fig.` reference tokens.
//
// Two reference forms are supported:
//   {{fig:<assetId>}}                 explicit cross-step reference
//   {{fig:step}} | ##Fig. | @Fig.    implicit reference to the current
//                                    step's own image block
//
// Figure numbers are derived from the order image blocks appear inside
// steps (walking steps → blocks → two_column cells). Assets that are
// never placed in a step have no number.
import { useMemo } from "react";
import type { ManualStep, StepBlock } from "./types";

export interface FigureSource {
  asset_id: string;
  caption?: string | null;
}

// Legacy: number assets by their order in the supplied list. Kept so
// existing callers (warnings preview) keep working. New code should
// prefer buildFigureMapFromSteps.
export function useFigureMap(images: FigureSource[]): Map<string, number> {
  return useMemo(() => {
    const m = new Map<string, number>();
    images.forEach((img, idx) => {
      if (img.asset_id && !m.has(img.asset_id)) m.set(img.asset_id, idx + 1);
    });
    return m;
  }, [images]);
}

// Walk every step's blocks (and two-column cells) in order and assign
// sequential figure numbers to each *placed* image asset.
export function buildFigureMapFromSteps(
  steps: ManualStep[] | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  if (!steps) return m;
  let n = 0;
  const visit = (b: StepBlock) => {
    if (b.type === "image" && b.asset_id) {
      if (!m.has(b.asset_id)) {
        n += 1;
        m.set(b.asset_id, n);
      }
    } else if (b.type === "two_column") {
      visit(b.left);
      visit(b.right);
    }
  };
  for (const s of steps) {
    for (const b of s.blocks ?? []) visit(b);
  }
  return m;
}

export function useStepFigureMap(
  steps: ManualStep[] | undefined,
): Map<string, number> {
  return useMemo(() => buildFigureMapFromSteps(steps), [steps]);
}

// First image-block figure number inside a single step, if any.
export function stepFirstImageNumber(
  step: ManualStep,
  figMap: Map<string, number>,
): number | null {
  for (const b of step.blocks ?? []) {
    if (b.type === "image" && b.asset_id) {
      const n = figMap.get(b.asset_id);
      if (n) return n;
    }
    if (b.type === "two_column") {
      for (const cell of [b.left, b.right]) {
        if (cell.type === "image" && cell.asset_id) {
          const n = figMap.get(cell.asset_id);
          if (n) return n;
        }
      }
    }
  }
  return null;
}

export interface BrokenRef {
  assetId: string;
  contextLabel: string;
}

const EXPLICIT_RE_G = /\{\{fig:([a-zA-Z0-9_-]+)\}\}/g;
const STEP_RE_G = /\{\{fig:step\}\}|##Fig\.|@Fig\./g;

export function collectBrokenRefs(
  fields: { label: string; text: string }[],
  figMap: Map<string, number>,
): BrokenRef[] {
  const out: BrokenRef[] = [];
  for (const f of fields) {
    if (!f.text) continue;
    const re = new RegExp(EXPLICIT_RE_G.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.text))) {
      if (m[1] === "step") continue;
      if (!figMap.has(m[1])) {
        out.push({ assetId: m[1], contextLabel: f.label });
      }
    }
  }
  return out;
}

const okChip =
  "rounded bg-sky-500/10 px-1 text-sky-700 dark:text-sky-300";
const brokenChip =
  "inline-flex items-center gap-1 rounded bg-rose-500/10 px-1 text-rose-700 line-through dark:text-rose-400";

// Resolve figure tokens inside an HTML string (used by TipTap-stored
// text blocks). Safe because all replacements are spans with our own
// classes; the input HTML is already what the editor produced.
export function resolveFigureTokensInHtml(
  html: string,
  figMap: Map<string, number>,
  stepImageNumber: number | null,
): string {
  if (!html) return html;
  let out = html.replace(STEP_RE_G, () =>
    stepImageNumber
      ? `<span class="${okChip}">Fig. ${stepImageNumber}</span>`
      : `<span class="${brokenChip}">Fig. ?<sup class="text-[10px] no-underline">⚠</sup></span>`,
  );
  out = out.replace(EXPLICIT_RE_G, (full, id) => {
    if (id === "step") return full; // already handled above
    const n = figMap.get(id);
    return n
      ? `<span class="${okChip}">Fig. ${n}</span>`
      : `<span class="${brokenChip}">Fig. ?<sup class="text-[10px] no-underline">⚠</sup></span>`;
  });
  return out;
}

export function FigureRefs({
  text,
  figMap,
  stepImageNumber = null,
  className,
}: {
  text: string;
  figMap: Map<string, number>;
  stepImageNumber?: number | null;
  className?: string;
}) {
  const parts = useMemo(() => {
    const segs: Array<string | { broken: boolean; label: string }> = [];
    if (!text) return segs;
    // Combined regex preserves order between explicit and step tokens.
    const combined = /\{\{fig:([a-zA-Z0-9_-]+)\}\}|##Fig\.|@Fig\./g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = combined.exec(text))) {
      if (m.index > lastIdx) segs.push(text.slice(lastIdx, m.index));
      const id = m[1];
      if (!id || id === "step") {
        segs.push(
          stepImageNumber
            ? { broken: false, label: `Fig. ${stepImageNumber}` }
            : { broken: true, label: "Fig. ?" },
        );
      } else {
        const n = figMap.get(id);
        segs.push(
          n
            ? { broken: false, label: `Fig. ${n}` }
            : { broken: true, label: "Fig. ?" },
        );
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < text.length) segs.push(text.slice(lastIdx));
    return segs;
  }, [text, figMap, stepImageNumber]);

  return (
    <span className={className}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : p.broken ? (
          <span
            key={i}
            title="No image in this step (or referenced image was deleted)"
            className={brokenChip}
          >
            {p.label}
            <sup className="text-[10px] no-underline">⚠</sup>
          </span>
        ) : (
          <span key={i} className={okChip}>
            {p.label}
          </span>
        ),
      )}
    </span>
  );
}
