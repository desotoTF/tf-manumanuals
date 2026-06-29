// Figure numbering + `##Fig.` reference tokens.
//
// - useFigureMap(images) builds {assetId -> number} from the current ordered
//   image list. Numbering is pure derivation, never stored. Reorder / insert /
//   delete an image and every dependent label updates in the same render.
// - <FigureRefs text figMap /> renders a string, swapping {{fig:<assetId>}}
//   tokens with "Fig. N". Missing references render as ~~Fig. ?~~ with a
//   warning chip (strike + warn — user can decide whether to fix it).
import { useMemo } from "react";
import { FIGURE_TOKEN_RE } from "./types";

export interface FigureSource {
  asset_id: string;
  caption?: string | null;
}

export function useFigureMap(images: FigureSource[]): Map<string, number> {
  return useMemo(() => {
    const m = new Map<string, number>();
    images.forEach((img, idx) => {
      if (img.asset_id && !m.has(img.asset_id)) m.set(img.asset_id, idx + 1);
    });
    return m;
  }, [images]);
}

export interface BrokenRef {
  assetId: string;
  contextLabel: string;
}

// Walk a record of text fields, return any token whose asset is missing.
export function collectBrokenRefs(
  fields: { label: string; text: string }[],
  figMap: Map<string, number>,
): BrokenRef[] {
  const out: BrokenRef[] = [];
  for (const f of fields) {
    if (!f.text) continue;
    const re = new RegExp(FIGURE_TOKEN_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.text))) {
      if (!figMap.has(m[1])) {
        out.push({ assetId: m[1], contextLabel: f.label });
      }
    }
  }
  return out;
}

export function FigureRefs({
  text,
  figMap,
  className,
}: {
  text: string;
  figMap: Map<string, number>;
  className?: string;
}) {
  const parts = useMemo(() => {
    const segs: Array<string | { broken: boolean; label: string }> = [];
    let lastIdx = 0;
    const re = new RegExp(FIGURE_TOKEN_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text ?? ""))) {
      if (m.index > lastIdx) segs.push(text.slice(lastIdx, m.index));
      const n = figMap.get(m[1]);
      segs.push(
        n
          ? { broken: false, label: `Fig. ${n}` }
          : { broken: true, label: "Fig. ?" },
      );
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < (text ?? "").length) segs.push(text.slice(lastIdx));
    return segs;
  }, [text, figMap]);

  return (
    <span className={className}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : p.broken ? (
          <span
            key={i}
            title="Referenced image was deleted"
            className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-1 text-rose-700 line-through dark:text-rose-400"
          >
            {p.label}
            <sup className="text-[10px] no-underline">⚠</sup>
          </span>
        ) : (
          <span
            key={i}
            className="rounded bg-sky-500/10 px-1 text-sky-700 dark:text-sky-300"
          >
            {p.label}
          </span>
        ),
      )}
    </span>
  );
}
