# Song Detail Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, CloudBase-synced song detail view with repeatable guitar-practice and roadshow-feedback records for every song.

**Architecture:** Keep navigation inside `SongRequestStation`, move record behavior into a focused `songRecords.ts` domain module and `SongDetailPanel.tsx` UI component, and reuse the current alias/password workspace session. Store each cloud record as an independent document so concurrent devices cannot overwrite the workspace or roadshow archive.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Tencent CloudBase Node SDK, Node test runner.

---

## File map

- Create `src/components/SongRequest/songRecords.ts`: record types, validation, sort, cache/session helpers, custom-song recovery.
- Create `src/components/SongRequest/SongDetailPanel.tsx`: responsive detail UI and repeatable practice/roadshow forms.
- Modify `src/components/SongRequest/SongRequestStation.tsx`: card navigation and private-session handoff.
- Modify `src/components/SongRequest/RoadshowPanel.tsx`: clear the active alias's song-record cache when locking.
- Modify `src/components/SongRequest/songRequestCloud.ts`: typed record pull/save/delete calls.
- Modify `cloudfunctions/songRequestSync/validation.js`: validate private song-record actions and payloads.
- Modify `cloudfunctions/songRequestSync/index.js`: authenticate and read/write independent record documents.
- Modify `tests/songRequest.test.ts`: domain and component integration tests.
- Modify `tests/songRequestSyncFunction.test.cjs`: cloud validation, isolation, save/pull/delete tests.
- Modify `docs/cloudbase-song-request-sync.md`: collection and client-deny security-rule deployment note.

### Task 1: Song-record domain and private cache

**Files:**
- Create: `src/components/SongRequest/songRecords.ts`
- Test: `tests/songRequest.test.ts`

- [ ] Write failing tests for multiple records on one song, ISO-time descending order, practice score/duration/text validation, roadshow feedback validation, alias-scoped cache parsing, unauthenticated cache refusal, cache clearing, malformed cloud-record filtering, and custom-song snapshot recovery from a station-level pull.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none --test-name-pattern "歌曲记录" tests/songRequest.test.ts`; expect failures because `songRecords.ts` does not exist.
- [ ] Implement `PracticeRecord`, `SongRoadshowRecord`, `SongRecord`, `SongRecordSession`, runtime cloud-record parser, validators, `sortSongRecords`, alias-scoped cache helpers, and snapshot recovery. Require positive integer minutes, score 60–100, at least one practice note field, and non-empty roadshow feedback; silently discard malformed cloud records.
- [ ] Re-run the targeted tests; expect all song-record domain tests to pass.

### Task 2: Independent CloudBase record documents

**Files:**
- Modify: `cloudfunctions/songRequestSync/validation.js`
- Modify: `cloudfunctions/songRequestSync/index.js`
- Test: `tests/songRequestSyncFunction.test.cjs`

- [ ] Add failing tests for `songRecords:pull`, `songRecords:save`, and `songRecords:delete`, including invalid fields, wrong credentials, workspace isolation, soft deletion, saving two records without either write being lost, and rejection of a stale save that targets a soft-deleted record ID.
- [ ] Run `node --test tests/songRequestSyncFunction.test.cjs`; expect new action tests to fail with `INVALID_ACTION`.
- [ ] Add strict payload validation and public error mapping for the three actions.
- [ ] Extend the injected store contract with `getSongRecords(workspaceId)`, `saveSongRecordAtomically(documentId, value)`, and `softDeleteSongRecordAtomically(documentId, workspaceId, deletedAt)`; use a deterministic hash of workspace ID plus record ID. Persist `workspaceId`, `songId`, `songTitle`, and `songArtist` on every document and query only by authenticated `workspaceId`. The default store must use a CloudBase database transaction for save/delete so a concurrent stale save cannot overwrite a tombstone; reject saves when the transactional read finds `deletedAt`.
- [ ] Wire the default CloudBase store to `song_request_song_records`; keep all access server-side.
- [ ] Re-run the cloud-function test file; expect all tests to pass.

### Task 3: Browser cloud adapter

**Files:**
- Modify: `src/components/SongRequest/songRequestCloud.ts`
- Test: `tests/songRequest.test.ts`

- [ ] Add failing source/integration assertions for `pullSongRecords`, `saveSongRecord`, and `deleteSongRecord` using the existing authenticated `callSync` path.
- [ ] Run the targeted adapter test; expect missing exports/actions.
- [ ] Implement the three typed adapter methods and map existing private-sync errors without introducing a second authentication scheme.
- [ ] Re-run the targeted adapter tests; expect pass.

### Task 4: Song detail UI and card navigation

**Files:**
- Create: `src/components/SongRequest/SongDetailPanel.tsx`
- Modify: `src/components/SongRequest/SongRequestStation.tsx`
- Modify: `src/components/SongRequest/RoadshowPanel.tsx`
- Test: `tests/songRequest.test.ts`

- [ ] Add failing component assertions for clickable song cards, request-button event isolation, detail/back navigation to that song's artist list, both record sections, all required inputs, repeated record rendering, delete controls, locked-state guidance, same-tab unlock/lock session events, station-level authenticated pull, cache fallback with “尚未同步”, retained form data after failed save, retained records after failed delete, and hiding recovered private songs after locking.
- [ ] Run the targeted component tests; expect failure because the panel and selection state do not exist.
- [ ] Implement `selectedSong`, make the card body a semantic button, and call `stopPropagation` from the request button.
- [ ] Export a shared session reader and a `song-request-session-change` browser event. Dispatch it from `RoadshowPanel` after successful register/login and on lock; listen in `SongRequestStation` so same-tab unlock immediately triggers a pull and lock immediately clears private records.
- [ ] On station mount and session changes, perform one authenticated `pullSongRecords` before any detail is opened and cache by normalized alias. Recover unknown custom-song snapshots only into alias-scoped in-memory `recoveredSongs`; never write them to the global editable catalog, and clear them on lock.
- [ ] Implement `SongDetailPanel` with the existing dark starfield/orange accent language: compact song header, two responsive timeline columns, datetime-local inputs, duration, score 60–100, three practice note fields, optional audience name, required feedback, save/delete states, local cache fallback, and cloud status. Only clear a form after confirmed cloud save; only remove a record after confirmed cloud delete.
- [ ] Read the shared roadshow session from `sessionStorage`; if absent, show no records and link the user to unlock the private roadshow space first. Update `RoadshowPanel.lock` to clear the active normalized-alias song-record cache before removing the session and dispatching the session-change event.
- [ ] Make `openSongDetail(song)` remember the song artist; closing details always sets `activeSection` to `artists` and `selectedArtist` to that artist, satisfying the “返回当前歌手歌曲列表” behavior even when opened from a playlist.
- [ ] Include alias-scoped `recoveredSongs` only in the current authenticated catalog view so synced records remain reachable; never persist them into the global editable catalog.
- [ ] Re-run targeted tests; expect pass.

### Task 5: Deployment note and verification

**Files:**
- Modify: `docs/cloudbase-song-request-sync.md`

- [ ] Document the `song_request_song_records` collection, server-only access, client-deny database rule, and cloud-function redeployment command.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/songRequest.test.ts`; expect zero failures.
- [ ] Run `node --test tests/songRequestSyncFunction.test.cjs`; expect zero failures.
- [ ] Run `npm run check`; expect exit code 0.
- [ ] Run `npm run build`; if Vite alone fails with the known sandbox `esbuild spawn EPERM`, report that environmental limitation without retrying after TypeScript and tests pass.
- [ ] Review `git diff` to confirm only song-record feature files and the two approved docs changed; do not touch unrelated dirty-worktree files.

### Task 6: Remove practice duration

**Files:**
- Modify: `src/components/SongRequest/songRecords.ts`
- Modify: `src/components/SongRequest/SongDetailPanel.tsx`
- Modify: `cloudfunctions/songRequestSync/validation.js`
- Modify: `tests/songRequest.test.ts`
- Modify: `tests/songRequestSyncFunction.test.cjs`

- [x] Write failing tests requiring practice records without `durationMinutes`, rejecting any visible “练习分钟数/累计时长” UI, and accepting old cached/cloud payloads while stripping their historical `durationMinutes` field.
- [ ] Run the targeted song-record and cloud-function tests; expect failures because duration is currently required and rendered.
- [x] Remove `durationMinutes` from the TypeScript model, forms, summary statistics, history cards, browser validation and cloud validation. Destructure and discard any old incoming `durationMinutes` so it is never returned or saved again.
- [ ] Run `npm test`, `node --test --experimental-test-isolation=none tests/songRequestSyncFunction.test.cjs`, and `npm run check`; expect all to pass.
