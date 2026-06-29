## Three fixes for image / figure handling

### 1. Stop step image selections from resetting when you upload to the Images tab

**Cause:** in `products.$productId.tsx`, every asset upload calls `qc.invalidateQueries(["manual-version", ...])`. The `useEffect` watching `versionQuery.data` then re-hydrates the local `content` state from the server, throwing away any unsaved edits (including the image block's selected asset).

**Fix:** only seed `content` from the server when the *version itself* changes — track `lastLoadedVersionId` and only `setContent(...)` when `versionQuery.data.version.id !== lastLoadedVersionId` (or `updated_at` advances past what we've already loaded). Asset list refetches no longer clobber unsaved blocks.

Belt-and-suspenders: in `uploadAssetMut.onSuccess` / `addAssetMut.onSuccess`, do a targeted update of the cached version's `assets` array instead of a full invalidate, so the editor never re-hydrates from a stale server snapshot.

### 2. Figure numbers should come from step order, not the Images tab order

**Today:** `useFigureMap(figureSources)` numbers assets in the order they appear in `assets[]` (Images tab order). The Images tab also shows "Fig. 1, Fig. 2…" using that same map.

**New rule:** walk `content.steps` in order; for each step, walk its `blocks` in order; every `image` block (and every `image` slot inside a `two_column` block) whose `asset_id` is set gets the next sequential number. An asset that is never placed in any step has no figure number.

Changes:
- New helper `buildFigureMapFromSteps(steps): Map<assetId, number>` in `src/lib/figure-refs.tsx`.
- `ContentEditor` derives `figMap` from `content.steps` (not from `assets`).
- `ImagesPanel` shows the figure number only when the asset appears in steps; otherwise show "Unused" instead of "—".
- `ImageBlockEditor` dropdown lists every asset by its caption / filename (not a fake "Fig. N" label), since N is now determined by placement, not by the asset list. The selected image renders "Fig. N" once it has a placement-derived number.
- `StepBlocksView` (public renderer) uses the same step-derived map so published manuals match.

### 3. `##Fig.` / `@Fig.` tokens resolve to image blocks in the same step

**Today:** `FigureRefField` only inserts tokens that include an explicit asset id (`{{fig:<assetId>}}`). The user wants to type a bare `##Fig.` or `@Fig.` in any text field inside a step and have it print the figure number of that step's image block.

**New behavior:**
- Recognise two token forms:
  - `{{fig:<assetId>}}` — explicit (kept for cross-step references).
  - `{{fig:step}}` — implicit; resolves to the first image block in the *current step* with a numbered asset.
- In the step block editor, typing `##Fig.` or `@Fig.` in a text block (TipTap) or in any callout/two-column text within that step inserts a `{{fig:step}}` token (rendered visibly as a chip in the editor, like the existing explicit refs).
- Rendering — both editor preview and public `StepBlocksView` — pass the owning step into the figure resolver so `{{fig:step}}` becomes "Fig. N" for that step's image. If the step has multiple image blocks, `{{fig:step}}` resolves to the first; we add `##Fig.2`, `##Fig.3` etc. as shorthand for additional in-step images (1-indexed within that step) for future flexibility — initial implementation supports only the single-image case per the user's "one image per step" description.
- A step with no image block renders `{{fig:step}}` as the same broken-ref chip that already exists in `FigureRefs`.

### Files touched

- `src/lib/figure-refs.tsx` — add `buildFigureMapFromSteps`, extend token regex to accept `step`, update `<FigureRefs />` to take an optional `stepImageNumber` for in-step resolution.
- `src/lib/types.ts` — extend `FIGURE_TOKEN_RE` to match `{{fig:step}}`.
- `src/components/manual-editor/StepBlocksEditor.tsx` — wire `##Fig.` / `@Fig.` auto-insert in TipTap and in callout/text inputs; pass owning step's image number into the renderer; update the image picker dropdown to use captions, not synthetic "Fig. N".
- `src/components/manual-editor/FigureRefField.tsx` — accept and emit `{{fig:step}}` when rendered inside a step context.
- `src/components/manual/StepBlocksView.tsx` — pass step image number into `<FigureRefs />` when rendering each step's text.
- `src/routes/_authenticated/products.$productId.tsx` — switch `figMap` derivation to steps; guard `setContent` against asset-only refetches; targeted cache update on upload/add/remove.
- `src/routes/manuals.$slug.tsx` — same figure-map switch for the published view.

No DB or server-function changes.
