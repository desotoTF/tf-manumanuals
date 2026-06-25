## Problem

The workflow's push step is being rejected with `403 Permission denied to github-actions[bot]`. That bot identity is the default `GITHUB_TOKEN`, not your `SECONDARY_REPO_TOKEN` PAT. The PAT never gets used.

**Why:** `actions/checkout@v4` defaults to `persist-credentials: true`, which installs a git credential helper that automatically supplies `GITHUB_TOKEN` for any `github.com` URL — overriding the token we embedded in the `secondary` remote URL.

## Fix

Add `persist-credentials: false` to the checkout step in `.github/workflows/mirror.yml`:

```yaml
- name: Checkout Primary Code
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    persist-credentials: false
```

That's the only change. The push step already embeds the PAT correctly; it just needs the credential helper out of the way.

## Verification

After the change syncs to GitHub:
1. Re-run the workflow (Actions → Auto Push to Secondary Repo → Run workflow), or wait for the next push.
2. Expect green ✅. Confirm `desotoTF/tf-manumanuals` has the new commit.

## If it still fails

Possible follow-ups (only if the 403 returns under a different identity):
- PAT was created on the wrong account — must be created while logged in as **desotoTF**.
- PAT lacks `repo` scope.
- Secret name typo — must be exactly `SECONDARY_REPO_TOKEN` at the **repository** secret level (not environment-scoped).
