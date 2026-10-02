<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The manual workspace (Build/Review/Publish) is a UI-only mode state in products.$productId.tsx; it maps onto existing manual_version_state transitions and never adds DB states — so publishing logic stays in one place.

- Manual export/import uses a versioned zip bundle (manual.json + assets/, format id "manual-bundle") built in the browser and loaded through the normal upload/save functions — so both brand deployments stay compatible and plan limits/RLS still apply.
