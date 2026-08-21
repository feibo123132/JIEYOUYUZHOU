# Meow Generator Panel Collapse Design

## Goal

Reduce control-panel obstruction while preserving fast access to every cat setting.

## Behaviour

1. The five top-level control sections form one accordion. Opening one section closes every other top-level section. Nested disclosures inside the active section keep their current independent behaviour.
2. A compact panel visibility button remains attached to the scene edge. Activating it hides the entire parameter panel and lets the cat scene occupy the released space. Activating it again restores the panel.
3. The button exposes `aria-expanded` and an explicit accessible label. Collapsing the panel does not discard parameter values or the currently selected section.
4. Panel visibility is session-only. Reloading returns to the existing default layout.

## Implementation

- Extract small DOM helpers for top-level accordion coordination and panel visibility so behaviour can be tested without the Three.js scene.
- Wire the accordion helper to existing top-level section headings only.
- Add one scene-edge toggle button to `index.html`, toggle one state class on the app shell, and use CSS to hide/restore the panel across desktop and mobile layouts.
- Trigger the existing resize path after visibility changes so the canvas fills the available area.

## Verification

- A focused test proves opening a section closes its open peer while nested disclosures are unaffected.
- A focused test proves the panel toggle updates the state class, accessible label, and `aria-expanded` value.
- Run the Meow Generator focused test and production build, then rebuild the host application.
