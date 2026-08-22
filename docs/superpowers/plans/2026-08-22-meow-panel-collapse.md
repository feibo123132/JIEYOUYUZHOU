# Meow Generator Panel Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top-level parameter sections mutually exclusive and let users completely hide and restore the parameter panel.

**Architecture:** Add a small DOM-state module used by `main.js` for accordion and panel visibility behaviour. Keep layout in the existing HTML/CSS shell and invoke the existing renderer resize path after panel visibility changes.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, CSS, Node assert scripts, Vite.

---

### Task 1: Test and implement panel state helpers

**Files:**
- Create: `vendor/meow-generator/src/panelUiState.js`
- Create: `vendor/meow-generator/scripts/test_panel_ui_state.mjs`

- [ ] **Step 1: Write failing tests** proving that opening one top-level section closes its peers, closing the active section permits zero open sections, and hiding/restoring the panel updates its class plus accessible button state.
- [ ] **Step 2: Run `node vendor/meow-generator/scripts/test_panel_ui_state.mjs`** and verify it fails because `panelUiState.js` does not exist.
- [ ] **Step 3: Implement minimal helpers** `setExclusiveSectionCollapsed(sections, target, collapsed)` and `setParameterPanelHidden(elements, hidden, labels)` that operate on supplied DOM-like elements.
- [ ] **Step 4: Re-run the focused test** and verify it passes.

### Task 2: Wire the interface and styles

**Files:**
- Modify: `vendor/meow-generator/index.html`
- Modify: `vendor/meow-generator/src/main.js`
- Modify: `vendor/meow-generator/src/style.css`

- [ ] **Step 1: Add failing source assertions** to the focused test for the scene-edge toggle markup and the full-panel-hidden CSS state.
- [ ] **Step 2: Run the focused test** and verify those assertions fail.
- [ ] **Step 3: Add the toggle button** inside `#viewport`, wire it through `setParameterPanelHidden`, localize its visible/accessible labels with the existing locale switch, and schedule `resize()` after changes.
- [ ] **Step 4: Route top-level heading clicks through `setExclusiveSectionCollapsed`; keep nested disclosures independent and start with only `体型` open.**
- [ ] **Step 5: Add responsive CSS** that fully removes `#panel` from layout, expands `#viewport`, and leaves the small restore button visible on desktop and mobile.
- [ ] **Step 6: Run `node vendor/meow-generator/scripts/test_panel_ui_state.mjs`** and verify all focused checks pass.

### Task 3: Build and integrate

**Files:**
- Update generated output: `public/meow-generator/`

- [ ] **Step 1: Set `$env:VITE_PUBLIC_BASE='./'`, run `npm --prefix vendor/meow-generator run build`,** and verify exit code 0 so the subdirectory deployment keeps relative asset URLs.
- [ ] **Step 2: Copy `vendor/meow-generator/dist/*` into `public/meow-generator/`** using the existing PowerShell copy workflow.
- [ ] **Step 3: Run `node --experimental-strip-types --test tests/meowStaticAssets.test.ts`** and verify all copied asset references remain inside `public/meow-generator/`.
- [ ] **Step 4: Run `npm run build`** and verify exit code 0.
- [ ] **Step 5: Review `git diff --check` and the scoped diff** for accidental changes.
- [ ] **Step 6: Commit the implementation** without adding `.codex-temp/`.
