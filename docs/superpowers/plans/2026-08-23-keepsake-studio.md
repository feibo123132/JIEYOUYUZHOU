# Keepsake Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class local photo keepsake studio with three configurable frames and 1200×1600 PNG export.

**Architecture:** Add an independent app view and React page. Keep rendering, geometry, text wrapping, and frame data in a pure Canvas module so preview and export call the same renderer. Keep all photo state in component memory and add no dependencies or network calls.

**Tech Stack:** React 18, TypeScript, Zustand, Canvas 2D, Tailwind CSS, Node test runner

---

## File map

- Create `src/components/Keepsake/keepsakeCanvas.ts`: frame contracts, geometry, cover transform, text wrapping, and Canvas renderer.
- Create `src/components/Keepsake/keepsakeFile.ts`: MIME validation, stale-safe image loading, object-URL ownership, pointer scaling, and PNG download.
- Create `src/components/Keepsake/KeepsakeStudio.tsx`: upload, form state, drag/zoom, preview, download, and cleanup.
- Create `tests/keepsakeCanvas.test.ts`: pure rendering-helper tests.
- Create `tests/keepsakeFile.test.ts`: browser-lifecycle helper tests with injected fakes.
- Modify `src/store/appStore.ts`: independent keepsake navigation.
- Modify `src/components/Theme/ThemeHub.tsx`: first-class keepsake card and callback.
- Modify `src/App.tsx`: route the new view.
- Modify `tests/appStore.test.ts`: navigation contract.

### Task 1: Navigation and homepage entry

- [ ] Extend `tests/appStore.test.ts` with a failing test asserting `enterKeepsakeStudio()` changes only `currentView` to `keepsake-studio`; it preserves `activeTheme`, user, and stars, while `returnToThemeHub()` keeps its existing cleanup contract.
- [ ] Run `node --experimental-strip-types --test tests/appStore.test.ts`; expect failure because the action/view does not exist.
- [ ] Add the `AppView` member and Zustand action in `src/store/appStore.ts`.
- [ ] Add `onOpenKeepsake` to `ThemeHub`, render a sibling `留影 / MEMORY STUDIO` card, and wire it from `App.tsx`.
- [ ] Re-run the test; expect pass.

### Task 2: Pure Canvas model

- [ ] Create failing `tests/keepsakeCanvas.test.ts` cases for three stable frames and the complete `{ id, name, palette, typography, decorations }` contract. Use a recording Canvas fake to prove configured colors, text positions, and decorations drive drawing without frame-ID branches.
- [ ] Add tests for retained explicit newlines; 18/80/16-character limits; one/three/one-line limits; final-line ellipsis; cover scale; 1–3× zoom; and pan clamping for portrait and landscape sources.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeCanvas.test.ts`; expect `ERR_MODULE_NOT_FOUND` for `keepsakeCanvas.ts`.
- [ ] Create `keepsakeCanvas.ts` exporting `KEEPSAKE_WIDTH`, `KEEPSAKE_HEIGHT`, `PHOTO_WINDOW`, `KEEPSAKE_FRAMES`, `normalizeKeepsakeText(field, value)`, `wrapCanvasText(ctx, text, maxWidth, maxLines)`, `getCoverTransform(imageSize, zoom, pan)`, `clampPhotoTransform(imageSize, zoom, pan)`, and `renderKeepsake(ctx, state)`; pan values and pointer deltas use 1200×1600 logical pixels.
- [ ] Implement the renderer with Canvas primitives only: paint paper/background, clip and draw the photo, add frame decoration, wrap text, and render date/signature.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeCanvas.test.ts`; expect all keepsake Canvas tests to pass.

### Task 3: File lifecycle and PNG export

- [ ] Create failing `tests/keepsakeFile.test.ts` cases for accepted `image/jpeg`, `image/png`, and `image/webp`; rejected MIME; request-version stale suppression; replacement/dispose URL revocation; read failure; `scalePointerDelta(delta, rect)` conversion; fixed-date local `YYYY-MM-DD` formatting; initial photo view `{ zoom: 1, pan: { x: 0, y: 0 } }`; exact 1200×1600 export; `toBlob(..., 'image/png')`; null/wrong-type blob errors; temporary download click; and download URL revocation.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeFile.test.ts`; expect `ERR_MODULE_NOT_FOUND` for `keepsakeFile.ts`.
- [ ] Create `keepsakeFile.ts` with `isSupportedImage(file)`, `createImageResourceManager({ createObjectURL, revokeObjectURL, loadImage })`, `scalePointerDelta(dx, dy, rect)`, `getLocalDateInputValue(date)`, `getInitialPhotoView()`, and `downloadKeepsakePng(canvas, { createObjectURL, revokeObjectURL, clickDownload })`. The manager owns one URL, increments a request version on every load, ignores stale resolutions, revokes replaced/stale/disposed URLs, and throws readable Chinese errors. The export helper rejects canvases not sized 1200×1600, null blobs, and non-PNG blobs, and always revokes its temporary URL.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeFile.test.ts`; expect all lifecycle/export tests to pass.

### Task 4: Keepsake Studio UI

- [ ] Add a failing source-contract test in `tests/keepsakeFile.test.ts` asserting the page imports and uses `getLocalDateInputValue` and `getInitialPhotoView`, uses a date input, exposes an aria-live error output, and sets `touch-action: none` on the preview interaction surface.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeFile.test.ts`; expect the new UI source-contract test to fail because `KeepsakeStudio.tsx` does not exist.
- [ ] Create `KeepsakeStudio.tsx` with local state for loaded image, text fields, frame ID, zoom, and logical-pixel pan. The resource manager exclusively owns object URLs and is disposed on unmount.
- [ ] Render the shared Canvas at 1200×1600 and size it responsively with CSS. Desktop uses a two-column layout; narrow screens stack preview above controls and keep the page vertically scrollable.
- [ ] Wire pointer capture for mouse/touch drag through `scalePointerDelta`, a 1–3× range input, accessible photo/frame/text/date/reset/export/back controls, and aria-live Chinese errors for validation, read, and export failures. After every successful new photo load, reset the view using `getInitialPhotoView()` so zoom is `1` and pan is `{ x: 0, y: 0 }`.
- [ ] Call `downloadKeepsakePng` with filename `JIEYOU留影-YYYY-MM-DD.png`.
- [ ] Run `node --experimental-strip-types --test tests/keepsakeFile.test.ts`; expect the UI source contract and helper tests to pass.

### Task 5: Verification

- [ ] Run `node --experimental-strip-types --test tests/appStore.test.ts tests/keepsakeCanvas.test.ts tests/keepsakeFile.test.ts`; expect all pass.
- [ ] Run `npm run build`; expect TypeScript and Vite production build to succeed.
- [ ] Inspect the final diff to confirm no dependency, persistence, network, or unrelated vendor changes were added.
- [ ] If local preview starts within two attempts, manually check desktop/narrow layout, upload, drag, zoom, frame switch, and PNG download; otherwise deliver after build with the environment limitation noted.

Git commits are omitted from execution because the current sandbox cannot create `.git/index.lock`; the user can commit from an administrator PowerShell later.
