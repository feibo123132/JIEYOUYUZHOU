# Cat Preset Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the existing cat preset list across browsers and devices through Tencent CloudBase while retaining immediate localStorage behavior.

**Architecture:** Keep preset serialization local and add a pure synchronization coordinator with persisted `code`, `dirty`, and `revision` state. The browser dynamically loads CloudBase only after sync is enabled and calls a small server-side `catPresetSync` function; the function validates input and stores one complete snapshot per hashed sync code in `cat_preset_snapshots`.

**Tech Stack:** Vanilla JavaScript, Vite, `@cloudbase/js-sdk@^2.22.5`, CloudBase event function, `@cloudbase/node-sdk@^3.18.3`, Node assert tests.

---

### Task 1: Pure sync-code and coordinator behavior

**Files:**
- Create: `vendor/meow-generator/src/catPresetSyncCore.js`
- Create: `vendor/meow-generator/scripts/test_cat_preset_sync.mjs`

- [ ] **Step 1: Write failing tests** for 20-character Crockford-style code generation/normalization, invalid input, strict all-or-nothing cloud snapshot validation, dirty startup upload, clean startup download, cloud-missing upload, failed upload retaining dirty state, coalesced sequential writes, late pull rejection after a local revision change, and stale pull/upload/status responses after disconnect/change-code.
- [ ] **Step 2: Run `node scripts/test_cat_preset_sync.mjs`** and verify failure because the core module does not exist.
- [ ] **Step 3: Implement the minimal pure API:**

```js
normalizePresetSyncCode(value)
formatPresetSyncCode(value)
generatePresetSyncCode(randomValues = crypto.getRandomValues.bind(crypto))
parsePresetSyncState(raw)
serializePresetSyncState(state)
validateCloudPresetSnapshot(value)
createPresetSyncCoordinator({ remote, readPresets, replacePresets, readState, writeState, onStatus })
```

The strict validator rejects the entire cloud response if any item, name, timestamp, parameter key, or parameter value is invalid; it must not sanitize or truncate. The coordinator owns a connection generation counter and one coalescing write loop. A pull captures `{generation, code, revision}` and applies only if all three still match and `dirty` is false. An upload clears dirty only if the uploaded revision is still current. All pull/upload/status callbacks compare generation and code before mutating state.
- [ ] **Step 4: Re-run the test** and expect `cat preset sync checks passed`.

### Task 2: CloudBase browser adapter and preset UI

**Files:**
- Create: `vendor/meow-generator/src/catPresetCloudSync.js`
- Modify: `vendor/meow-generator/src/main.js`
- Modify: `vendor/meow-generator/src/style.css`
- Modify: `vendor/meow-generator/src/i18n.js`
- Modify: `vendor/meow-generator/vite.config.js`
- Modify: `vendor/meow-generator/package.json`
- Modify: `vendor/meow-generator/scripts/test_cat_presets.mjs`

- [ ] **Step 1: Extend preset tests** to require the sync row labels/actions and assert every successful local preset mutation calls the coordinator's `localChanged` hook.
- [ ] **Step 2: Run `node scripts/test_cat_presets.mjs`** and verify the new assertions fail.
- [ ] **Step 3: Add `@cloudbase/js-sdk` to the vendor package** and implement a lazy singleton adapter using `import.meta.env.VITE_TCB_ENV_ID`, anonymous login, and `app.callFunction({ name: 'catPresetSync', data: { action, code, presets } })`.
- [ ] **Step 4: Add the compact sync UI** beneath the existing preset status: code input, generate/connect, copy, immediate sync, disconnect, and the approved short status messages. Persist sync state in `meow-generator-cat-preset-sync-v1`.
- [ ] **Step 5: Integrate local-first writes:** keep `persistCatPresets` synchronous and call `coordinator.localChanged()` after save/rename/update/delete; cloud failures never revert local data. On cloud pull, first require `validateCloudPresetSnapshot` to pass, then persist the already-valid list and re-render. Never use lenient `parseCatPresets` as cloud validation.
- [ ] **Step 6: Set `envDir` in Vite config** so the isolated vendor build reads the repository-root `.env` without copying secrets.
- [ ] **Step 7: Run preset and sync tests** and expect both to pass.

### Task 3: Validating CloudBase event function

**Files:**
- Create: `cloudfunctions/catPresetSync/package.json`
- Create: `cloudfunctions/catPresetSync/validation.js`
- Create: `cloudfunctions/catPresetSync/index.js`
- Create: `tests/catPresetSyncFunction.test.cjs`

- [ ] **Step 1: Write failing function tests** with an injected fake document store for rejected actions/codes, more than 20 presets, unknown parameter keys, payloads over 128 KB, missing document pull, valid pull, and valid complete-snapshot push.
- [ ] **Step 2: Run `node --test tests/catPresetSyncFunction.test.cjs`** and verify failure before implementation.
- [ ] **Step 3: Implement CommonJS validation** with the same preset parameter whitelist/ranges as `catPresets.js`, a strict 20-character normalized code, and a 128 KB serialized request limit.
- [ ] **Step 4: Implement the handler** using `@cloudbase/node-sdk@^3.18.3`, `crypto.createHash('sha256')`, `cloudbase.SYMBOL_CURRENT_ENV`, `db.serverDate()`, and one document per digest. Export a dependency-injected handler factory for tests and `exports.main` for CloudBase.
- [ ] **Step 5: Re-run function tests** and expect all cases to pass.

### Task 4: Deployment instructions and production verification

**Files:**
- Create: `docs/cloudbase-cat-preset-sync.md`
- Build/sync: `vendor/meow-generator/dist/**` → `public/meow-generator/**`

- [ ] **Step 1: Document and check the one-time setup:** read `VITE_TCB_ENV_ID` without printing it, run `tcb env login get -e <envId> --json` to verify `AnonymousLogin` is enabled, create `cat_preset_snapshots`, set collection client rules to `{ "read": false, "write": false }`, and allow `catPresetSync` invocation for `auth != null`.
- [ ] **Step 2: Run:**

```powershell
node vendor/meow-generator/scripts/test_cat_preset_sync.mjs
node vendor/meow-generator/scripts/test_cat_presets.mjs
node --test tests/catPresetSyncFunction.test.cjs
```

Expected: all pass.
- [ ] **Step 3: Build and sync:**

```powershell
Set-Location vendor/meow-generator
$env:VITE_PUBLIC_BASE='./'
npm run build
Copy-Item '.\dist\*' '..\..\public\meow-generator' -Recurse -Force
```

- [ ] **Step 4: Run the exact static-asset test:** `node --experimental-strip-types --test tests/meowStaticAssets.test.ts`, then verify the new hashed bundle is referenced by `public/meow-generator/index.html`.
- [ ] **Step 5: Deploy when the authenticated CLI is available:** `tcb fn deploy catPresetSync --dir ./cloudfunctions/catPresetSync --install-dependency true --env-id <envId> --yes`. If CLI authentication or collection/rule mutation is unavailable, stop and give the user the exact console/administrator command; do not claim runtime completion.
- [ ] **Step 6: Run a deployed smoke test** from the browser SDK or a temporary authenticated script: push a uniquely named disposable snapshot through `catPresetSync`, pull it with the same code, assert equality, and restore/remove the disposable document. Verify anonymous login is actually enabled. Only after this passes may cross-device runtime completion be claimed.
