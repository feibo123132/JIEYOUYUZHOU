# Life Theme Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-theme hub that lets one shared nickname enter either the existing JIEYOU universe or the new Life Celebration project while keeping all theme content data isolated.

**Architecture:** Extend the existing Zustand view state with an atomic `activeTheme` state machine, centralize all copy/style/audio/data differences in typed theme configuration, and pass a required `ThemeId` through every star and pet data operation. Keep the current welcome and starry-sky components shared; add only a focused `ThemeHub` entry component and pure routing helpers that can be tested without a browser.

**Tech Stack:** React 18, TypeScript 5.8, Zustand 5, Vite 6, Tailwind CSS 3, Tencent CloudBase, optional Supabase/custom REST fallbacks, Node 22 test runner.

---

## File structure

- Create `src/themes/themeConfig.ts`: theme IDs, copy, visual tokens, audio files, and collection mappings.
- Create `src/components/Theme/ThemeHub.tsx`: equal two-card theme selector and isolated theme counts.
- Create `tests/themeConfig.test.ts`: pure configuration and API-route isolation tests.
- Create `tests/appStore.test.ts`: atomic navigation-state tests.
- Modify `src/store/appStore.ts`: `theme-hub` initial view and atomic theme navigation actions.
- Modify `src/App.tsx`: render the hub, feed theme configuration into shared components, and switch audio sources.
- Modify `src/components/Welcome/WelcomeScreen.tsx`: replace hard-coded JIEYOU copy and count lookup with theme props.
- Modify `src/components/Welcome/NicknameInput.tsx`: theme-aware input and submit copy.
- Modify `src/components/StarrySky/StarrySky.tsx`: required theme prop, isolated service calls, themed labels, reset-on-switch behavior.
- Modify `src/components/StarrySky/CreateStarModal.tsx`: themed prompt, confirm label, and allowed voice list.
- Modify `src/services/tcb.ts`: choose collections from theme configuration for star operations.
- Modify `src/services/starService.ts`: require `ThemeId` for all star operations and keep backend fallbacks isolated.
- Modify `src/services/supabase.ts`: maintain separate mock maps and choose theme-specific tables.
- Modify `src/services/api.ts`: retain legacy JIEYOU paths but use `/themes/life/...` for Life.
- Modify `src/services/connectivity.ts`: require a successful Life theme health endpoint before using custom REST.
- Modify `src/utils/syncQueue.ts`: include theme in queued star operations and use a versioned queue key.
- Modify `package.json`: add the focused Node test command.
- Modify `.gitignore`: ignore `.superpowers/` visual-companion artifacts.

### Task 1: Add typed theme configuration and routing tests

**Files:**
- Create: `src/themes/themeConfig.ts`
- Create: `tests/themeConfig.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing theme configuration test**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { getThemeConfig, getThemeStarApiPath, THEME_IDS } from '../src/themes/themeConfig.ts'

test('the two themes use distinct content collections', () => {
  const jieyou = getThemeConfig('jieyou')
  const life = getThemeConfig('life')
  assert.deepEqual(THEME_IDS, ['jieyou', 'life'])
  assert.equal(jieyou.data.starsCollection, 'stars')
  assert.equal(life.data.starsCollection, 'life_stars')
})

test('life REST calls never use the generic stars endpoint', () => {
  assert.equal(getThemeStarApiPath('jieyou'), '/stars')
  assert.equal(getThemeStarApiPath('life'), '/themes/life/stars')
})

test('all theme-scoped storage targets stay distinct', () => {
  const jieyou = getThemeConfig('jieyou').data
  const life = getThemeConfig('life').data
  assert.notEqual(jieyou.starsCollection, life.starsCollection)
  assert.notEqual(jieyou.quotaStorageKey, life.quotaStorageKey)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --experimental-strip-types --test tests/themeConfig.test.ts`

Expected: FAIL because `src/themes/themeConfig.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed theme configuration**

```ts
export type ThemeId = 'jieyou' | 'life'
export const THEME_IDS: ThemeId[] = ['jieyou', 'life']

export interface ThemeConfig {
  id: ThemeId
  hub: { name: string; eyebrow: string; description: string }
  welcome: {
    title: string
    intro: [string, string]
    countPrefix: string
    countNoun: string
    description: [string, string]
    features: [string, string, string]
    enterLabel: string
  }
  nickname: { placeholder: string; submitLabel: string; loadingLabel: string }
  sky: {
    title: string
    createLabel: string
    creatingLabel: string
    hint: string
    successNoun: string
    switchLabel: string
    modalPrompt: string
    modalConfirmLabel: string
    unavailableMessage: string
  }
  visual: {
    accent: 'purple' | 'gold'
    defaultStarColor: string
    titleGradientClass: string
    buttonGradientClass: string
    buttonHoverClass: string
    glowClass: string
  }
  audio: { background: string; voices: string[] }
  data: { starsCollection: string; quotaStorageKey: string }
}

export const getThemeConfig = (id: ThemeId): ThemeConfig => THEME_CONFIGS[id]
export const tryGetThemeConfig = (id: string | null): ThemeConfig | null =>
  id && id in THEME_CONFIGS ? THEME_CONFIGS[id as ThemeId] : null
export const getThemeStarApiPath = (id: ThemeId) => id === 'jieyou' ? '/stars' : '/themes/life/stars'
```

Populate both configs with the approved Chinese copy. Use the existing JIEYOU strings unchanged and use the Life copy from the design spec. Use `你终将会找到属于自己的月亮.mp3` for JIEYOU background audio and `祝你有美好的一天.mp3` for Life. Limit Life voice clips to semantically compatible files.

- [ ] **Step 4: Add the test script and ignore visual artifacts**

Add to `package.json`:

```json
"test": "node --experimental-strip-types --test tests/*.test.ts"
```

Add `.superpowers/` to `.gitignore`.

- [ ] **Step 5: Run the focused test**

Run: `pnpm test`

Expected: 3 passing tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/themes/themeConfig.ts tests/themeConfig.test.ts
git commit -m "feat: add typed universe theme configuration"
```

### Task 2: Make theme navigation atomic in Zustand

**Files:**
- Modify: `src/store/appStore.ts`
- Create: `tests/appStore.test.ts`

- [ ] **Step 1: Write failing store navigation tests**

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import useAppStore from '../src/store/appStore.ts'

test('theme navigation updates theme and view atomically', () => {
  useAppStore.setState({ user: null, stars: [] })
  useAppStore.getState().returnToThemeHub()
  assert.equal(useAppStore.getState().currentView, 'theme-hub')
  assert.equal(useAppStore.getState().activeTheme, null)
  useAppStore.getState().enterTheme('life')
  assert.equal(useAppStore.getState().currentView, 'welcome')
  assert.equal(useAppStore.getState().activeTheme, 'life')
  useAppStore.getState().enterStarrySky()
  assert.equal(useAppStore.getState().currentView, 'starry-sky')
})

test('returning to the hub preserves user identity and clears theme stars', () => {
  const user = { id: 'u1', nickname: '星光', isAuthenticated: false }
  useAppStore.setState({ user, stars: [{ id: 's1' }] as never[] })
  useAppStore.getState().returnToThemeHub()
  assert.deepEqual(useAppStore.getState().user, user)
  assert.deepEqual(useAppStore.getState().stars, [])
})
```

- [ ] **Step 2: Run the store test and verify it fails**

Run: `node --experimental-strip-types --test tests/appStore.test.ts`

Expected: FAIL because theme state/actions do not exist.

- [ ] **Step 3: Implement atomic navigation actions**

Replace unrestricted `setCurrentView` usage with:

```ts
type AppView = 'theme-hub' | 'welcome' | 'starry-sky'

enterTheme: (activeTheme) => set({ activeTheme, currentView: 'welcome', stars: [], error: null }),
enterStarrySky: () => set((state) => state.activeTheme
  ? { currentView: 'starry-sky', stars: [], error: null }
  : { currentView: 'theme-hub', activeTheme: null, stars: [], error: null }),
returnToThemeHub: () => set({ activeTheme: null, currentView: 'theme-hub', stars: [], error: null }),
```

Initial state must be `activeTheme: null` and `currentView: 'theme-hub'`.

- [ ] **Step 4: Run both tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/appStore.ts tests/appStore.test.ts
git commit -m "feat: add atomic theme navigation state"
```

### Task 3: Thread ThemeId through all data services

**Files:**
- Modify: `src/themes/themeConfig.ts`
- Modify: `src/services/tcb.ts`
- Modify: `src/services/starService.ts`
- Modify: `src/services/supabase.ts`
- Modify: `src/services/api.ts`
- Modify: `src/services/connectivity.ts`
- Modify: `src/utils/syncQueue.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Welcome/WelcomeScreen.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `tests/themeConfig.test.ts`

- [ ] **Step 1: Extend the failing routing tests**

Add assertions for delete, health, and quota/statistics paths:

```ts
assert.equal(getThemeStarApiPath('life', 'abc'), '/themes/life/stars/abc')
assert.equal(getThemeHealthApiPath('life'), '/themes/life/health')
assert.equal(getThemeTodayCountApiPath('life'), '/themes/life/stats/today')
```

Run: `pnpm test`

Expected: FAIL until helpers accept record IDs and expose theme-safe health/statistics paths.

- [ ] **Step 2: Make TCB operations theme-aware**

Make `isTcbReachable(themeId)` probe the selected theme's star collection rather than always probing `stars`. Every star method takes `themeId` first and resolves:

```ts
const { starsCollection } = getThemeConfig(themeId).data
const stars = () => (tcbDb as any).collection(starsCollection)
```

Apply it to `getAllStars`, `getTodayCountByNickname`, `createStar`, and `deleteStar`. If TCB is configured but the selected collection is missing or forbidden, return a typed `theme_unavailable` error instead of probing or reading the other theme.

- [ ] **Step 3: Isolate Supabase and local mock storage**

Use `getThemeConfig(themeId).data.starsCollection` as the Supabase table. Supabase read/create/delete errors must throw a typed `theme_unavailable` or `theme_operation_failed` error; remove the current `getAllStars` behavior that logs and returns `[]`, because an unavailable Life table must reach the UI error/retry state. Change mock storage from one map to:

```ts
stars: { jieyou: new Map(), life: new Map() }
```

Require `themeId` for mock create/read/delete operations.

- [ ] **Step 4: Enforce safe custom API routing**

Keep `/stars` compatibility only for JIEYOU. Life methods use `/themes/life/stars`. `isBackendReachable('life')` checks `/themes/life/health`; a missing route returns false so `starService` skips the generic API rather than risking mixed data. Add `api.getTodayCountByNickname(themeId, nickname)` using `/themes/life/stats/today?nickname=...` for Life. Never call a generic statistics or quota endpoint for Life.

- [ ] **Step 5: Make the service facade require ThemeId**

Update the star service signatures:

```ts
starService.createStar(themeId, userId, nickname, position, options)
starService.getAllStars(themeId)
starService.getUserStars(themeId, userId)
starService.deleteStar(themeId, starId)
starService.getTodayCountByNickname(themeId, nickname)
```

Queue payloads include `themeId`, and the queue key becomes `syncQueue:v2` so legacy unscoped operations cannot replay into the wrong theme.

Update all current call sites in this task so the boundary remains TypeScript-clean: resolve the active `ThemeConfig` in `App`, pass it to `WelcomeScreen` and `StarrySky`, and use `theme.id` for every service call. Do not change visible copy yet.

- [ ] **Step 6: Run tests and TypeScript**

Run: `pnpm test`

Expected: all tests pass.

The pure routing suite must cover both themes' collection names, Supabase table names, REST read/create/delete paths, health/statistics paths, and quota keys. These assertions are the regression barrier against adding an unscoped fallback later.

Run: `pnpm run check`

Expected: exit code 0. Do not commit an intentionally broken service/UI boundary.

- [ ] **Step 7: Commit**

```bash
git add src/themes/themeConfig.ts src/services src/utils/syncQueue.ts src/App.tsx src/components/Welcome/WelcomeScreen.tsx src/components/StarrySky/StarrySky.tsx tests/themeConfig.test.ts
git commit -m "feat: isolate theme data services"
```

### Task 4: Add the two-card theme hub

**Files:**
- Create: `src/components/Theme/ThemeHub.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement the hub against the typed config**

`ThemeHub` receives `onSelect(themeId)` and loads each count with `starService.getAllStars(themeId)`. Keep count state separate per theme and render `—` on failure. Use equal cards on desktop and stacked cards on mobile.

Required accessible controls:

```tsx
<button type="button" onClick={() => onSelect(theme.id)} aria-label={`进入${theme.hub.name}`}>
```

The JIEYOU card uses purple/indigo glow; Life uses warm gold/orange glow. Both share the current `StarryCanvas` background through `App`.

- [ ] **Step 2: Render the hub as the initial App view**

Use `enterTheme(themeId)` from the store. Do not create a user or fetch theme stars merely by selecting a card beyond the displayed count.

Resolve the selected config with the `tryGetThemeConfig` helper created in Task 1. If it is absent at runtime, use an effect to call `returnToThemeHub()` and show a toast rather than mutating state during render or guessing JIEYOU/a collection name:

```ts
const theme = activeTheme ? tryGetThemeConfig(activeTheme) : null
useEffect(() => {
  if (!activeTheme || theme) return
  returnToThemeHub()
  toast.error('主题配置不可用，请重新选择')
}, [activeTheme, theme, returnToThemeHub])
```

- [ ] **Step 3: Run TypeScript and production build**

Run: `pnpm run check`

Expected: exit code 0.

Run: `pnpm run build`

Expected: exit code 0; advisory chunk-size warnings are acceptable.

- [ ] **Step 4: Commit**

```bash
git add src/components/Theme/ThemeHub.tsx src/App.tsx
git commit -m "feat: add dual universe theme hub"
```

### Task 5: Theme the shared welcome flow and audio

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Welcome/WelcomeScreen.tsx`
- Modify: `src/components/Welcome/NicknameInput.tsx`

- [ ] **Step 1: Add required theme props to welcome components**

`WelcomeScreen` receives `theme: ThemeConfig` and calls `starService.getAllStars(theme.id)`. Replace titles, count copy, features, button label, and accent classes with config values. `NicknameInput` receives the full `theme` or its visual token set in addition to placeholder/loading/submit copy, and replaces its purple focus ring, icon, counter, hover border, and submit gradient with the selected theme's classes so Life is consistently warm gold/orange.

- [ ] **Step 2: Keep the shared nickname flow**

If `user` already exists, `handleWelcomeEnter` calls `enterStarrySky()`. Otherwise it focuses the current nickname input. `handleNicknameSubmit` continues to call shared `userService.createUser(nickname)`, saves one `user`, then calls `enterStarrySky()`.

- [ ] **Step 3: Switch audio safely by active theme**

Reuse one `HTMLAudioElement`; on theme change pause it, update `src` from `theme.audio.background`, clear/rebuild `window.__sfxMap`, and load only that theme's voice list. Returning to the hub pauses audio but retains the music-toggle boolean. If the toggle is active when another theme is chosen, attempt to resume the new track and fall back to the existing permission toast on rejection.

- [ ] **Step 4: Run tests and TypeScript**

Run: `pnpm test && pnpm run check`

Expected: tests pass and TypeScript exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Welcome
git commit -m "feat: theme the shared welcome experience"
```

### Task 6: Theme the starry sky and creation modal

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/StarrySky/StarrySky.tsx`
- Modify: `src/components/StarrySky/CreateStarModal.tsx`

- [ ] **Step 1: Require ThemeConfig in the starry sky**

Add `theme: ThemeConfig` and replace every star call with its `theme.id` equivalent. Include `theme.id` in the load effect dependency and clear `stars`, selected details, modal/sidebar state, searches, and welcome overlays before each load. Add `loadState: 'loading' | 'ready' | 'error'` and a retry counter. A `theme_unavailable` failure renders the theme-specific unavailable message (for Life: `幸福星空暂时无法抵达`) and a retry button; it must not be converted into a successfully loaded empty sky.

- [ ] **Step 2: Make quota and copy theme-specific**

Use `theme.data.quotaStorageKey` instead of `device_daily_quota`. Route remote quota checks through `starService.getTodayCountByNickname(theme.id, userNickname)` so TCB, theme-aware REST, and isolated mock behavior share one facade. Replace heading, CTA, hint, success toast, detail noun, welcome overlay, default star color, and switch label from configuration.

- [ ] **Step 3: Implement the one-step theme switch**

The upper-left button calls a local cleanup routine, then `onSwitchTheme()`. Its label is `切换企划`. App wires it to `returnToThemeHub()`, which preserves `user` but clears global theme stars.

Update `App.tsx` in this task to pass `theme` and `onSwitchTheme` to `StarrySky`; include `App.tsx` in this task's commit so integration remains complete.

- [ ] **Step 4: Theme the creation modal audio and text**

Pass the full `theme` (including prompt, confirm label, visual tokens, count noun, project title, and `theme.audio.voices`) into `CreateStarModal`. Replace the existing incoming-star preview text that hard-codes `JIEYOU宇宙` with values derived from the selected theme. Keep the generic `点亮星星的音效.mp3`, then randomly choose only from the current theme's approved voice list. Life must not display JIEYOU preview copy or play `欢迎你到解忧宇宙遨游.mp3` and other JIEYOU-specific lines.

- [ ] **Step 5: Run the full automated checks**

Run: `pnpm test`

Expected: all tests pass.

Run: `pnpm run check`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/StarrySky
git commit -m "feat: theme and isolate the shared starry sky"
```

### Task 7: Verify the complete feature and document external setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document CloudBase provisioning**

Add a short setup note that `life_stars` must exist with access rules equivalent to the current `stars` collection. Do not include credentials or environment values.

- [ ] **Step 2: Run all checks from a fresh command**

Run: `pnpm test`

Expected: all tests pass, 0 failures.

Run: `pnpm run check`

Expected: exit code 0.

Run: `pnpm run build`

Expected: exit code 0. Chunk-size and stale Browserslist warnings are advisory.

- [ ] **Step 3: Perform a bounded local UI smoke test**

Run: `pnpm run dev -- --host 127.0.0.1`

Verify:

1. App opens on the two-card hub.
2. JIEYOU retains existing copy and current stars.
3. `切换企划` returns directly to the hub without losing nickname.
4. Life welcome and starry sky use approved warm copy and colors.
5. Life never renders a JIEYOU star during loading or after switching.
6. Counts, quotas, search results, and star-pet progress remain isolated.
7. Mobile width stacks the two theme cards and keeps CTAs reachable.
8. An unavailable `life_stars` collection shows the Life-specific retry state rather than an empty sky.
9. The Life creation modal contains no JIEYOU text and uses only Life-compatible voices.

Stop the server immediately after verification.

- [ ] **Step 4: Inspect the diff for accidental scope**

Run: `git status --short` and `git diff --stat`.

Expected: only the files listed in this plan plus the design/plan documents; `.superpowers/` is ignored.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plans/2026-08-17-life-theme-switch.md
git commit -m "docs: add life theme setup and implementation plan"
```
