# Deploy to Public Repo Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hardened GitHub Actions workflow that builds this Nuxt 4 app and pushes the static output to the public repo `local-recorder-public` (branch `prod`), fixing the five issues found in investigation of this specific repo.

**Architecture:** Two-file change. (1) Pin the pnpm version used across CI via `packageManager` in `package.json` so `pnpm/action-setup@v4` doesn't need an explicit `version:` and stays in lockstep with `pnpm-lock.yaml` (`lockfileVersion: '9.0'`). (2) Add `.github/workflows/deploy.yml`, adapted from the user's draft, with: frozen-lockfile install, a pinned third-party action tag, and a concurrency group so overlapping pushes to `main` can't race on `prod`.

**Tech Stack:** Nuxt 4.3.1 (static `generate`), pnpm 9.x, `@vite-pwa/nuxt` 1.0.4, GitHub Actions, `cpina/github-action-push-to-another-repository`.

## Global Constraints

- Public repo: `local-recorder-public`, destination GitHub username: `abdell1999`, target branch: `prod`.
- Base path is a subpath, not `/`: `NUXT_APP_BASE_URL=/local-recorder-public/`.
- Commit messages in Spanish, no co-author trailer, commit directly on `main` (repo convention — see root `CLAUDE.md`).
- Repo has no `.github/workflows/` directory yet — this plan creates it.

## Investigation Findings (already verified — do not re-derive)

1. **packageManager missing.** `package.json` has no `packageManager` field. Local `pnpm -v` → `9.12.1`. `pnpm-lock.yaml` → `lockfileVersion: '9.0'`, which `pnpm@9.12.1` produces/reads natively. Fix: add `"packageManager": "pnpm@9.12.1"` so `pnpm/action-setup@v4` auto-detects the version (no `version:` input needed, no version drift vs. the lockfile).
2. **No absolute-path assets to fix.** Grepped all `.vue`/`.ts` for `href="/…"`, `src="/…"`, `to="/…"`, `url(/…)` — zero matches. The PWA manifest icon in `nuxt.config.ts:14` is already relative (`icon.svg`, no leading slash). `@vite-pwa/nuxt` derives `start_url`/`scope`/injected `<link>` tags from Nuxt's `app.baseURL`, and Nuxt auto-overrides `app.baseURL` from the `NUXT_APP_BASE_URL` env var at build time (already present in the workflow) even though `nuxt.config.ts` doesn't declare `app.baseURL` explicitly — this is Nuxt's built-in special-cased env override, not something this repo needs to add. **No code changes needed for this item**, beyond keeping the `NUXT_APP_BASE_URL` env line in the generate step.
3. **Action version.** Latest release tag of `cpina/github-action-push-to-another-repository` is `v1.7.3` (commit `55306faa4ed53b815ae49e564af8cfb359d32ae2`). Pin to `v1.7.3` instead of `@main`.
4. **Lockfile-strict installs.** Replace `pnpm install` with `pnpm install --frozen-lockfile` in CI.
5. **Concurrency.** Add top-level `concurrency: { group: deploy-public, cancel-in-progress: true }` so two pushes to `main` in quick succession can't interleave writes to `prod`.

---

### Task 1: Pin pnpm version via `packageManager`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `packageManager` field consumed by `pnpm/action-setup@v4` in Task 2's workflow (that action reads `package.json#packageManager` automatically when no `version:` input is given — this is why Task 2's workflow omits `version:`).

- [ ] **Step 1: Add the `packageManager` field**

Edit `package.json`, adding the field right after `"private": true,`:

```json
{
  "name": "local-recorder",
  "private": true,
  "packageManager": "pnpm@9.12.1",
  "type": "module",
  ...
```

- [ ] **Step 2: Verify a frozen-lockfile install still works locally**

Run: `pnpm install --frozen-lockfile`
Expected: exits 0, no "lockfile is not up to date" or "specifiers in the lockfile don't match" errors. (This proves the pinned pnpm version and the checked-in `pnpm-lock.yaml` agree, which is the exact failure mode this task exists to prevent in CI.)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "ci: fija versión de pnpm vía packageManager"
```

---

### Task 2: Add the public-repo deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `packageManager` field from `package.json` (Task 1) — `pnpm/action-setup@v4` reads it, no `version:` input passed.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy to Public Repo

on:
  push:
    branches:
      - main

env:
  REPO_PUBLICO: "local-recorder-public"

concurrency:
  group: deploy-public
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout private repo
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm vitest run

      - name: Generate static site
        env:
          NUXT_APP_BASE_URL: /${{ env.REPO_PUBLICO }}/
        run: pnpm generate

      - name: Add .nojekyll file
        run: touch .output/public/.nojekyll

      - name: Push to public repository
        uses: cpina/github-action-push-to-another-repository@v1.7.3
        env:
          API_TOKEN_GITHUB: ${{ secrets.DEPLOY_TOKEN }}
        with:
          source-directory: ".output/public"
          destination-github-username: "abdell1999"
          destination-repository-name: ${{ env.REPO_PUBLICO }}
          user-email: ${{ secrets.EMAIL }}
          target-branch: "prod"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" ` (Windows: same command via any Python on PATH; if no Python available, use `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"` if `js-yaml` is present, otherwise open the file and manually diff indentation against the block above)
Expected: no exception raised.

- [ ] **Step 3: Confirm secrets are documented/expected**

Run: `git grep -n "DEPLOY_TOKEN\|secrets.EMAIL" .github/workflows/deploy.yml`
Expected: both `secrets.DEPLOY_TOKEN` and `secrets.EMAIL` appear — this is a reminder to the person merging that these two repo secrets must exist in GitHub Settings → Secrets before this workflow can run successfully (`DEPLOY_TOKEN` needs push access to `local-recorder-public`). This step doesn't change code — it's a checkpoint, not blocking the commit.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: añade workflow de deploy a repo público local-recorder-public"
```

---

## Post-plan note (not a task — informational)

This plan does not create the `DEPLOY_TOKEN` / `EMAIL` GitHub secrets or the `local-recorder-public` repo itself — those are one-time manual setup outside this codebase. The workflow will fail at the "Push to public repository" step until both exist.
