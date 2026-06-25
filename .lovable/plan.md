## Plan

1. **Treat this as a GitHub token/auth issue, not a Render or bootstrap-code issue**
   - The primary repo has the bootstrap fix.
   - Render points to the secondary repo, so the only blocker is getting the mirror workflow to push successfully.

2. **Update the mirror workflow authentication format**
   - Change the secondary remote URL from:

```text
https://x-access-token:${{ secrets.SECONDARY_REPO_TOKEN }}@github.com/desotoTF/tf-manumanuals.git
```

   - To a PAT-friendly form using the GitHub username as the URL user, for example:

```text
https://desotoTF:${{ secrets.SECONDARY_REPO_TOKEN }}@github.com/desotoTF/tf-manumanuals.git
```

3. **Add a fast secret guard to make failures clearer**
   - Before adding the remote, fail with a readable message if `SECONDARY_REPO_TOKEN` is empty or unavailable to the workflow.
   - This helps distinguish “bad token” from “secret not being injected.”

4. **Keep the push behavior the same**
   - Continue force-pushing `main` from the primary repo to `desotoTF/tf-manumanuals`.
   - No app code or Render config needs to change.

5. **After approval**
   - I’ll edit only `.github/workflows/mirror.yml`.
   - Then you can re-run the failed workflow. If it succeeds, redeploy Render from the secondary repo and hit `/api/public/bootstrap` again.