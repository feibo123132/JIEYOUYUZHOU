# Cat Preset Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add named, browser-local kitten presets between the scene and Motion sections.

**Architecture:** Put allowlist-based preset data operations in a small pure module, and keep DOM/storage integration in the existing generator entrypoint. Reuse the existing collapsible-section and button styles, adding only compact form/list styles.

**Tech Stack:** Vanilla JavaScript, DOM, localStorage, Node test runner, Vite

---

### Task 1: Preset data model

**Files:**
- Create: `vendor/meow-generator/src/catPresets.js`
- Create: `vendor/meow-generator/scripts/test_cat_presets.mjs`
- Modify: `vendor/meow-generator/package.json`

- [ ] Write failing Node tests for an explicit cat-only field allowlist, malformed JSON fallback, same-name replacement, and the 20-item cap.
- [ ] Run `npm run test:presets --prefix vendor/meow-generator` and confirm it fails because the module is missing.
- [ ] Implement the smallest pure preset helpers needed by the tests.
- [ ] Re-run the command and confirm all preset tests pass.

### Task 2: Preset panel

**Files:**
- Modify: `vendor/meow-generator/src/main.js`
- Modify: `vendor/meow-generator/src/style.css`
- Modify: `vendor/meow-generator/src/i18n.js`

- [ ] Add the collapsed “预设保存” section immediately after “场景与渲染”.
- [ ] Add name input, save action, status text, and apply/delete list.
- [ ] Apply a preset through the existing parameter refresh and full rebuild path.
- [ ] Add compact responsive styles and Chinese/Japanese/English copy.

### Task 3: Verification and distribution copy

**Files:**
- Modify generated files under `public/meow-generator/` via the existing Vite build.

- [ ] Run `npm run test:presets --prefix vendor/meow-generator`.
- [ ] Run `npm run build --prefix vendor/meow-generator`.
- [ ] Run the root `npm run build` so the integrated app remains valid.
- [ ] Inspect the final diff for scope and generated-asset consistency.

### Task 4: Editable names and parameter updates

**Files:**
- Modify: `vendor/meow-generator/src/catPresets.js`
- Modify: `vendor/meow-generator/src/main.js`
- Modify: `vendor/meow-generator/src/style.css`
- Modify: `vendor/meow-generator/src/i18n.js`
- Test: `vendor/meow-generator/scripts/test_cat_presets.mjs`

- [ ] Add failing tests for rename success, empty/duplicate-name rejection, and UI update controls.
- [ ] Run `npm run test:presets --prefix vendor/meow-generator` and confirm the new assertions fail.
- [ ] Add a pure rename helper and render each name as an editable input.
- [ ] Add an “更新” action that captures current cat parameters and replaces the selected preset without renaming it.
- [ ] Re-run preset tests, rebuild the generator with `VITE_PUBLIC_BASE=./`, sync its output, then run static-asset and root build checks.

### Task 5: Save expression and light direction

**Files:**
- Modify: `vendor/meow-generator/src/catPresets.js`
- Modify: `vendor/meow-generator/src/main.js`
- Test: `vendor/meow-generator/scripts/test_cat_presets.mjs`

- [ ] Add failing tests proving expression and valid light angles are preserved, invalid values are filtered, and old presets preserve each missing current value during apply.
- [ ] Add the three optional fields to the existing allowlist and validators.
- [ ] Save/update with a snapshot containing the two light angles; assign each optional field only when present, then sync the expression control, light direction, and light orb.
- [ ] Re-run preset/static tests, rebuild and sync the generator, and run the root production build.
