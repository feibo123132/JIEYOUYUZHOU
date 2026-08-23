# Keepsake Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dependency-free mobile and desktop camera capture to the existing Keepsake Studio.

**Architecture:** Put camera capability, request cancellation, stream cleanup, error mapping, video readiness, frame capture, and the modal state machine in a testable helper. The React component renders helper snapshots and supplies browser adapters, while accepted camera files still enter the existing image resource manager.

**Tech Stack:** React 18, TypeScript, MediaDevices/getUserMedia, MediaStream, Canvas 2D, Node test runner

---

## File map

- Create `src/components/Keepsake/keepsakeCamera.ts`: constraints, support/error helpers, cancellable video preparation, JPEG capture, and modal workflow.
- Create `tests/keepsakeCamera.test.ts`: helper lifecycle and capture tests.
- Modify `src/components/Keepsake/KeepsakeStudio.tsx`: camera button, state machine, modal, capture/review/use flow, and cleanup.
- Modify `tests/keepsakeFile.test.ts`: UI source contract for camera states and controls.

### Task 1: Camera helper

- [ ] Create failing `tests/keepsakeCamera.test.ts` cases for `{ video: { facingMode: { ideal: 'environment' } }, audio: false }`, `isCameraAvailable({ isSecureContext, mediaDevices })`, `NotAllowedError`/`NotFoundError`/`NotReadableError`/fallback Chinese messages, and stopping every stream track.
- [ ] Add `prepareCameraVideo(video, stream, signal)` tests for an already-ready fast path, metadata listener cleanup, abort while metadata is pending, `video.play()` rejection, and abort/late resolution while play is pending. It sets `srcObject`, waits for nonzero dimensions, calls `play()`, and never completes successfully after abort.
- [ ] Add capture tests proving zero video dimensions, missing 2D context, and null Blob reject. `captureVideoFrame(video, { createCanvas, createFile, now })` must draw at native dimensions, request `image/jpeg` quality `0.92`, and return a `File` named `JIEYOU拍摄-YYYY-MM-DD-HHmmss.jpg` with MIME `image/jpeg`.
- [ ] Add behavioral tests for `createCameraWorkflow(deps)`. Its concrete dependencies are `isAvailable()`, `getUserMedia(constraints)`, `prepareVideo(stream, signal)`, `detachVideo()`, `captureFrame()`, `loadPhotoFile(file, signal): Promise<boolean>`, `createObjectURL(file)`, `revokeObjectURL(url)`, and `onChange(snapshot)`.
- [ ] Define the returned API as `open(): Promise<void>`, `capture(): Promise<void>`, `retake(): Promise<void>`, `usePhoto(): Promise<boolean>`, `close(): void`, and `dispose(): void`. Snapshots are discriminated as `closed`, `requesting`, `live`, `captured`, or `error`; `live` and `captured` include `busy: boolean`, `captured` includes the File/review URL, and recoverable operation messages are explicit fields.
- [ ] Verify workflow snapshots use `closed | requesting | live | captured | error` plus an optional operation error. Concurrent `open()` calls share one request; `close()` aborts/increments generation and clears the pending slot so reopen starts a new request even if the old one is unresolved; late stale streams are stopped. Rejected requests reset the pending slot and enter retryable `error`.
- [ ] Cover delayed permission cancel/unmount, close-then-reopen, cancellation during metadata and play, duplicate opens, open/play failure cleanup, retake reusing the stream after a normal capture, and use success/failure. `usePhoto()` stops every track and detaches video immediately when confirmation begins, before awaiting `loadPhotoFile`. Failed use remains `captured`, keeps the File/review URL, can retry use without a stream, and leaves the current photo unchanged; retake after that cleanup starts a new camera request. Only `true` from `loadPhotoFile` closes and commits.
- [ ] Cover duplicate capture/use and close/retake during pending capture/load. Each async operation uses its own token/AbortSignal: stale completions cannot emit state, create an unowned review URL, or commit a photo after cancellation; duplicate operations share the active promise or return without invoking the dependency twice.
- [ ] Verify `open()` checks `isAvailable()` first. Insecure context or missing `getUserMedia` enters retryable unavailable error without calling the API, while the upload path remains independent.
- [ ] Assert review URLs are revoked before replacement and on retake/cancel/success/open-error/dispose, while successful image-manager URLs are never passed to camera cleanup.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/keepsakeCamera.test.ts`; expect `ERR_MODULE_NOT_FOUND`.
- [ ] Implement the tested APIs in `keepsakeCamera.ts`. `createCameraWorkflow` owns the stream, AbortControllers, generation/operation tokens, pending open/capture/use promises, captured File, and camera review URL. Every async continuation checks generation/signal before changing state. `close()`/`dispose()` and every error abort, detach, and stop every track; close/dispose additionally revoke review URLs and emit `closed`.
- [ ] Re-run the same command; expect all camera helper tests to pass.

### Task 2: Camera modal and existing image pipeline

- [ ] Extend `tests/keepsakeFile.test.ts` with a failing source-contract test for `直接拍摄`, rendering `requesting/live/captured/error` snapshots, `autoPlay`, `muted`, `playsInline`, `拍摄`, `重拍`, `使用照片`, `重试`, `取消`, `createCameraWorkflow`, and unmount disposal.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/keepsakeFile.test.ts`; expect the new contract assertions to fail.
- [ ] In `KeepsakeStudio.tsx`, extract `loadPhotoFile(file, signal?): Promise<boolean>` from upload handling. Validation/read/stale/aborted failure returns `false` without altering the current photo or view; it checks the signal immediately before React state updates. A committed load updates the photo and resets `{ zoom: 1, pan: { x: 0, y: 0 }`, then returns `true`.
- [ ] Add a sibling “直接拍摄” button and render the workflow snapshot in a modal. Browser adapters call `getUserMedia`, `prepareCameraVideo(videoRef.current, stream, signal)`, clear `video.srcObject`, call `captureVideoFrame`, and delegate file loading to `loadPhotoFile`.
- [ ] Render requesting progress; live video and enabled capture only after readiness; captured frozen `<img>` with use/retake/cancel; and retryable open errors. Every error path stops/detaches the stream. Capture errors show retry, while decode/use errors keep the frozen review; retake then starts a new request because the errored stream is closed.
- [ ] Dispose the workflow on unmount. Camera cleanup owns only the stream and review URL; the image manager continues to own accepted-photo URLs.
- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/keepsakeFile.test.ts tests/keepsakeCamera.test.ts`; expect all tests to pass.

### Task 3: Verification

- [ ] Run `node --experimental-strip-types --test --experimental-test-isolation=none tests/keepsakeCamera.test.ts tests/keepsakeFile.test.ts tests/keepsakeCanvas.test.ts tests/appStore.test.ts`; expect all targeted tests to pass.
- [ ] Run `npm test`; expect zero failures.
- [ ] Run `npm run check`; expect TypeScript success.
- [ ] Run `npm run build` once. If the known sandbox `esbuild spawn EPERM` recurs, do not retry; report that Vite packaging remains environment-blocked.
- [ ] Inspect the diff to confirm no dependency, microphone, persistence, upload, camera-switching, or unrelated-file changes.

Git commits and a worktree are omitted because this workspace has already demonstrated that the sandbox cannot create `.git/index.lock`; the user explicitly chose the fastest inline implementation.
