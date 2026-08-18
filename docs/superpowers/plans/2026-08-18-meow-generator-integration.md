# Meow Generator Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the complete noncommercial Meow Generator source at a pinned upstream commit, publish its working static build under `meow-generator/`, and add a local entry link to the existing theme hub.

**Architecture:** Keep Meow Generator as an isolated Vanilla JavaScript/Vite sub-application so its Three.js scene, Cannon-es physics, styles, audio, and browser state cannot conflict with the React host. Store the complete upstream working tree under `vendor/meow-generator/`, store deployment-ready output under `public/meow-generator/`, and navigate to it with a native relative link from `ThemeHub`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite 6 host, upstream Vite 7, Three.js, Cannon-es, Node test runner, PowerShell/Git for the pinned source import.

---

## File structure

- `src/utils/meowGenerator.ts` — owns construction of the host-relative sub-application URL.
- `src/components/Theme/ThemeHub.tsx` — renders the accessible Meow Generator entry strip below the two existing theme cards.
- `tests/meowGenerator.test.ts` — tests URL construction and the host integration contract.
- `tests/meowStaticAssets.test.ts` — verifies the vendored source, license records, static build entry, and emitted asset files.
- `scripts/test-meow-static.mjs` — serves the production `dist/` tree over HTTP and verifies the real subpath, one emitted asset, and license records.
- `tests/fixtures/empty-static-root/.gitkeep` — deterministic empty server root used to prove the HTTP verifier fails before it is pointed at a real production build.
- `package.json` — exposes the production HTTP verification script.
- `vendor/meow-generator/` — complete upstream working tree at commit `e34483fa7c7fa105618d073444c47adffa69b070`, excluding only `.git`, `node_modules`, and generated build caches.
- `vendor/meow-generator/UPSTREAM.md` — provenance, pinned commit, license scope, and rebuild instructions.
- `public/meow-generator/` — upstream Vite build output plus `LICENSE` and `UPSTREAM.md`, copied into the host production build.

### Task 1: Add the local navigation contract

**Files:**
- Create: `tests/meowGenerator.test.ts`
- Create: `src/utils/meowGenerator.ts`

- [ ] **Step 1: Write the failing URL test**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { getMeowGeneratorUrl } from '../src/utils/meowGenerator.ts'

test('builds a host-relative Meow Generator URL', () => {
  assert.equal(getMeowGeneratorUrl('./'), './meow-generator/')
  assert.equal(getMeowGeneratorUrl('/jieyou/'), '/jieyou/meow-generator/')
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/meowGenerator.test.ts`

Expected: FAIL because `src/utils/meowGenerator.ts` does not exist.

- [ ] **Step 3: Add the minimal helper**

```ts
export const getMeowGeneratorUrl = (baseUrl = import.meta.env.BASE_URL || '/') => {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}meow-generator/`
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --experimental-strip-types --test tests/meowGenerator.test.ts`

Expected: PASS.

### Task 2: Define the complete-source and static-build contract

**Files:**
- Create: `tests/meowStaticAssets.test.ts`
- Create later in Task 3: `vendor/meow-generator/**`
- Create later in Task 3: `public/meow-generator/**`

- [ ] **Step 1: Write failing filesystem contract tests**

Use Node built-ins to assert that the following exist:

```text
vendor/meow-generator/package.json
vendor/meow-generator/src/main.js
vendor/meow-generator/shots/
vendor/meow-generator/third_party/mesh2motion/
vendor/meow-generator/LICENSE
vendor/meow-generator/COMMERCIAL-LICENSE.md
vendor/meow-generator/UPSTREAM.md
public/meow-generator/index.html
public/meow-generator/LICENSE
public/meow-generator/UPSTREAM.md
```

Parse `public/meow-generator/index.html`, collect local `src`/`href` asset references, and assert that at least one script is present and every collected local file exists below `public/meow-generator/`.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/meowStaticAssets.test.ts`

Expected: FAIL because the pinned upstream working tree and built sub-application are not present.

### Task 3: Import and build the pinned upstream project

**Files:**
- Create: `vendor/meow-generator/**`
- Create: `vendor/meow-generator/UPSTREAM.md`
- Create: `public/meow-generator/**`
- Create: `public/meow-generator/LICENSE`
- Create: `public/meow-generator/UPSTREAM.md`

- [ ] **Step 1: Fetch and verify the exact upstream commit**

Clone `https://github.com/ringhyacinth/Meow-Generator.git` into a unique temporary directory, checkout `e34483fa7c7fa105618d073444c47adffa69b070`, and verify `git rev-parse HEAD` equals that SHA. Do not import the nested `.git` directory.

- [ ] **Step 2: Install and run upstream tests in the temporary clone**

Run:

```powershell
npm ci
npm run test:share
npm run test:fish-pick
npm run test:poke
npm run test:motion
```

Expected: all upstream tests exit 0. If an upstream test is unavailable or fails at the pinned commit, preserve the exact evidence and diagnose before copying code.

- [ ] **Step 3: Build with relative asset paths**

```powershell
$env:VITE_PUBLIC_BASE = './'
npm run build
```

Expected: upstream `dist/index.html` and local assets are generated without absolute GitHub Pages paths.

- [ ] **Step 4: Copy the complete working tree**

Copy all upstream files and directories into `vendor/meow-generator/`, excluding only `.git`, `node_modules`, `dist`, and tool caches. Preserve `.github`, `docs`, `scripts`, `shots`, `src`, `third_party`, localized README files, licenses, lockfile, and Vite configurations.

- [ ] **Step 5: Record provenance and rebuild instructions**

Create `vendor/meow-generator/UPSTREAM.md` with:

- repository URL;
- pinned commit SHA;
- import date `2026-08-18`;
- Required Notice;
- PolyForm Noncommercial scope and commercial-license pointer;
- exact `npm ci`, test, relative-base build, and dist-copy commands.

- [ ] **Step 6: Publish the static sub-application**

Copy the upstream `dist/` contents to `public/meow-generator/`, then copy `LICENSE` and `UPSTREAM.md` into that directory. Do not modify upstream application behavior or branding.

- [ ] **Step 7: Run the filesystem contract and verify GREEN**

Run: `node --experimental-strip-types --test tests/meowStaticAssets.test.ts`

Expected: PASS with all source, provenance, build, and referenced-asset checks satisfied.

### Task 4: Add the homepage entry strip

**Files:**
- Modify: `tests/meowGenerator.test.ts`
- Modify: `src/components/Theme/ThemeHub.tsx`

- [ ] **Step 1: Add a failing host integration test**

Read `ThemeHub.tsx` and assert the component imports and uses `getMeowGeneratorUrl`, renders a native anchor with the label “进入猫猫生成器”, and does not contain the external GitHub Pages URL.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --test tests/meowGenerator.test.ts`

Expected: FAIL because the entry strip has not been rendered.

- [ ] **Step 3: Implement the entry strip**

Import `PawPrint` and the URL helper. Render a native `<a href={getMeowGeneratorUrl()}>` below the existing two-card section with:

- `aria-label="进入猫猫生成器"`;
- warm orange and mint edge lighting on the existing dark glass surface;
- `MEOW GENERATOR`, “进入猫猫生成器”, and a concise feature description;
- a visible arrow and existing click sound;
- responsive horizontal/vertical layout;
- keyboard focus styling and `motion-safe`/`motion-reduce` Tailwind variants.

Do not change `THEME_IDS`, star counts, theme selection, the application store, or existing theme-card behavior.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --experimental-strip-types --test tests/meowGenerator.test.ts`

Expected: PASS.

### Task 5: Add production-equivalent HTTP verification

**Files:**
- Create: `scripts/test-meow-static.mjs`
- Create: `tests/fixtures/empty-static-root/.gitkeep`
- Modify: `package.json`

- [ ] **Step 1: Write the failing static-server verification script**

Using only Node built-ins, start an HTTP server on an ephemeral localhost port rooted at `process.env.MEOW_STATIC_ROOT || 'dist'`. Fetch and assert:

- `/meow-generator/` returns 200 and contains Meow Generator’s document marker;
- the response is not the React host fallback HTML;
- at least one local script or stylesheet referenced by that HTML returns 200;
- `/meow-generator/LICENSE` returns 200 and contains `PolyForm Noncommercial License 1.0.0`;
- `/meow-generator/UPSTREAM.md` returns 200 and contains the pinned SHA.

Always close the server in `finally`.

- [ ] **Step 2: Expose the script and verify deterministic RED against an empty root**

Add `"test:meow-static": "node scripts/test-meow-static.mjs"` to `package.json`.

Create the committed empty fixture directory, then run:

```powershell
$env:MEOW_STATIC_ROOT = 'tests/fixtures/empty-static-root'
npm run test:meow-static
$redExitCode = $LASTEXITCODE
Remove-Item Env:MEOW_STATIC_ROOT
if ($redExitCode -eq 0) { throw 'Expected the empty-root HTTP verification to fail' }
```

Expected: the verifier reports FAIL because `/meow-generator/` returns 404 from the intentionally empty root, `$redExitCode` is nonzero, and the explicit assertion confirms the RED result instead of allowing the cleanup command to mask it. This result is independent of any pre-existing `dist/` contents.

- [ ] **Step 3: Build the host and verify GREEN over HTTP**

Run:

```powershell
npm run build
npm run test:meow-static
```

Expected: both commands exit 0 and every real HTTP request passes.

### Task 6: Regression and visual verification

**Files:**
- Verify only; modify only if a failing check identifies an integration defect.

- [ ] **Step 1: Run focused tests**

```powershell
node --experimental-strip-types --test tests/meowGenerator.test.ts tests/meowStaticAssets.test.ts
```

- [ ] **Step 2: Run host regressions**

```powershell
npm test
npm run check
npm run build
npm run test:meow-static
```

Expected: all exit 0 with no test failures or TypeScript/build errors.

- [ ] **Step 3: Inspect the production build and complete core interaction smoke tests in a browser**

Start at most one short-lived local static preview, then inspect desktop and mobile widths. Verify the entry strip preserves the two-card hierarchy, is keyboard focusable, stays within the first-page composition, and opens the local Meow Generator.

On the deployed `/meow-generator/` path, smoke-test the upstream features required by the design:

- the kitten scene renders without a fatal console error;
- changing at least one body-shape control visibly changes the kitten;
- selecting a different coat visibly changes its pattern or color;
- switching Chinese, English, and Japanese updates the interface labels;
- generating a PNG collection card downloads a file that can be opened and decoded as a valid PNG;
- at a mobile viewport, the controls remain usable and one pointer/touch-style drag interaction reaches the canvas without the host page intercepting it;
- browser Back returns to the theme hub.

These checks run against the same production build and relative subpath already verified over HTTP, so they validate the built artifact rather than the source-only development server. Stop the preview after inspection; a preview environment failure does not invalidate passing automated tests and production build, but any unverified manual item must be reported explicitly rather than claimed as passing.

- [ ] **Step 4: Review the final diff and provenance**

Confirm only the approved host integration, source import, generated static build, license/provenance records, tests, and docs are new or changed. Confirm unrelated dirty StarrySky/barrage files are untouched.
