# Global Artist Settings Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync one public artist order/avatar/adjustment snapshot across localhost and GitHub Pages while restricting writes to the existing private-space owner.

**Architecture:** Extend the existing `songRequestSync` CloudBase function with public pull and transaction-protected private push actions. Keep a validated local cache and dirty/base-revision marker, treat cloud as the public source of truth, and migrate the current localhost snapshot only after a confirmed empty cloud response.

**Tech Stack:** React 18, TypeScript, Vite, Tencent CloudBase JS/Node SDK, Node test runner.

---

Shared workspace note: preserve all existing dirty changes and do not commit unless the user explicitly asks.

### Task 1: Add the artist settings domain module

**Files:**
- Create: `src/components/SongRequest/artistSettings.ts`
- Modify: `tests/songRequest.test.ts`

- [ ] **Step 1: Write failing tests** for parsing valid/invalid snapshots, pruning keys outside `artistOrder`, merging cloud order with newly added local artists, detecting non-default local settings, and reading/writing `{ changeId, baseRevision, snapshot }` drafts.
- [ ] **Step 2: Run** `node --experimental-strip-types --test --experimental-test-isolation=none --test-name-pattern="artist settings" tests/songRequest.test.ts` and confirm failures are caused by the missing module.
- [ ] **Step 3: Implement** `ArtistSettingsSnapshot`, `ArtistSettingsDraft`, cache keys, `parseArtistSettingsSnapshot`, `mergeArtistOrder`, `createArtistSettingsSnapshot`, `hasCustomArtistSettings`, `load/save/clearArtistSettingsDraft`, and local cache helpers. Add pure `resolveArtistSettingsPull` and `resolveSuccessfulArtistSettingsPush` coordinators that model pull-time edits, revision comparison, newest-draft clearing, and rebasing a newer same-page draft after an earlier push succeeds.
- [ ] **Step 4: Add runnable coordinator tests** for: edit during pull preserves draft; confirmed null may seed but a thrown pull never seeds; old draft versus newer cloud conflicts; edit during in-flight push is rebased to returned revision; conflict/failed push preserves draft; dirty clears only when the latest `changeId` succeeds.
- [ ] **Step 5: Re-run the focused tests** and require all to pass.

### Task 2: Extend CloudBase validation and handler

**Files:**
- Modify: `cloudfunctions/songRequestSync/validation.js`
- Modify: `cloudfunctions/songRequestSync/index.js`
- Modify: `tests/songRequestSyncFunction.test.cjs`

- [ ] **Step 1: Write failing validator tests** for `artistSettings:pull`, `artistSettings:push`, `expectedRevision: null|positive integer`, exact field/range checks, Base64 decoding and PNG/JPEG/WebP magic bytes, 1 MiB decoded-image limit, 5 MiB request limit, and unchanged 256 KiB limits for existing actions.
- [ ] **Step 2: Write failing handler tests** covering null pull, public sanitized pull, datastore read failure returning `SYNC_FAILED`, first transaction claim, two null-revision claims with only one winner, same-owner revision update, stale revision `CONFLICT`, different-owner `AUTH_FAILED`, and client revision/time being replaced by transaction-generated values.
- [ ] **Step 3: Run** `node --test tests/songRequestSyncFunction.test.cjs` and confirm the new tests fail for missing actions/store methods.
- [ ] **Step 4: Implement validation** with `validateArtistSettings` and action-specific payload limits; add `INVALID_ARTIST_SETTINGS` and `CONFLICT` to public errors.
- [ ] **Step 5: Implement handler actions** before the existing private action tail. Public pull calls `store.getArtistSettings()`. Push authenticates the workspace and calls one atomic `store.saveArtistSettingsAtomically(ownerWorkspaceId, expectedRevision, snapshot)` method that conditionally creates/updates and returns server revision/time.
- [ ] **Step 6: Add production store methods** backed by `song_request_artist_settings/global` and `db.runTransaction`; strip `ownerWorkspaceId` from public output.
- [ ] **Step 7: Re-run cloud-function tests** and require all to pass.

### Task 3: Add browser cloud adapter methods

**Files:**
- Modify: `src/components/SongRequest/songRequestCloud.ts`
- Modify: `tests/songRequest.test.ts`

- [ ] **Step 1: Write failing source/API tests** for `pullArtistSettings()` and `pushArtistSettings(credentials, expectedRevision, snapshot)` using the existing `callSync` singleton, including rejection on network/`SYNC_FAILED` rather than conversion to a null snapshot.
- [ ] **Step 2: Run the focused test** and confirm it fails because exports/actions are absent.
- [ ] **Step 3: Implement typed adapter methods** and map `AUTH_FAILED`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, and `INVALID_ARTIST_SETTINGS` to concise status text without changing existing record sync messages.
- [ ] **Step 4: Re-run the focused tests** and TypeScript check.

### Task 4: Integrate hydration, migration, drafts, and serialized pushes

**Files:**
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `tests/songRequest.test.ts`

- [ ] **Step 1: Write failing component-source tests** requiring a StrictMode-safe initialization guard, one public pull effect, confirmed-null-only migration, dirty/baseRevision checks, local cache application, private-session-only push worker, and sync triggers when sorting finishes, upload succeeds, or avatar adjustment finishes. Behavioral state transitions are tested through Task 1's runnable coordinator tests rather than source assertions alone.
- [ ] **Step 2: Run the focused tests** and confirm failure for missing integration.
- [ ] **Step 3: Hydrate from cloud** on mount: read local draft/cache, call public pull, preserve dirty local edits, otherwise apply cloud order/avatar/adjustments and persist cache.
- [ ] **Step 4: Implement initial migration** only when pull returns `null`, local settings are non-default, and a private session exists; use `expectedRevision: null`.
- [ ] **Step 5: Implement a single-flight push worker** using refs and the Task 1 coordinator. Each local edit receives a monotonically increasing `changeId` and records the current confirmed revision as `baseRevision`; a successful response clears only the pushed latest draft or rebases a newer same-page draft to the returned revision before the worker loops. Conflicts and failures preserve dirty data and stop the worker.
- [ ] **Step 6: Wire explicit sync points**: toggle from sorting mode to complete, successful upload, avatar-adjustment completion, and session acquisition when a compatible dirty draft exists. Do not push on every range-input event.
- [ ] **Step 7: Re-run focused tests** and TypeScript check.

### Task 5: Full verification and deployment handoff

**Files:**
- Verify all modified files; no new production files beyond Task 1.

- [ ] **Step 1: Run** `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`.
- [ ] **Step 2: Run** `node --test tests/songRequestSyncFunction.test.cjs`.
- [ ] **Step 3: Run** `npm.cmd run check`.
- [ ] **Step 4: Run** `npm.cmd run build` once. If the known Windows sandbox `esbuild spawn EPERM` recurs, do not retry; report that tests/typecheck passed and build was environment-blocked.
- [ ] **Step 5: Run** `git diff --check -- cloudfunctions/songRequestSync/index.js cloudfunctions/songRequestSync/validation.js src/components/SongRequest/artistSettings.ts src/components/SongRequest/songRequestCloud.ts src/components/SongRequest/SongRequestStation.tsx tests/songRequest.test.ts tests/songRequestSyncFunction.test.cjs docs/superpowers/specs/2026-08-28-global-artist-settings-sync-design.md docs/superpowers/plans/2026-08-28-global-artist-settings-sync.md` and inspect the final diff for unrelated edits.
- [ ] **Step 6: Document deployment requirement:** both the frontend and updated `songRequestSync` cloud function must be deployed. After deployment, open localhost with the existing private-space session once to seed the current settings; GitHub Pages visitors then receive the public snapshot.
