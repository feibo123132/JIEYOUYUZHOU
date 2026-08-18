import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (relativePath: string) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  'utf8',
)

const getSwitchSource = (source: string, label: string) => {
  const labelIndex = source.indexOf(`aria-label="${label}"`)
  assert.notEqual(labelIndex, -1, `missing ${label} switch`)
  const start = source.lastIndexOf('<button', labelIndex)
  const end = source.indexOf('</button>', labelIndex)
  assert.ok(start >= 0 && end > labelIndex, `incomplete ${label} switch`)
  const switchSource = source.slice(start, end + '</button>'.length)
  assert.equal((switchSource.match(/<button/g) ?? []).length, 1)
  return switchSource
}

const getClassTokens = (source: string, element: 'button' | 'span') => {
  const elementStart = source.indexOf(`<${element}`)
  const marker = 'className={`'
  const classStart = source.indexOf(marker, elementStart)
  assert.ok(elementStart >= 0 && classStart > elementStart, `missing ${element} classes`)
  const valueStart = classStart + marker.length
  const valueEnd = source.indexOf('`}', valueStart)
  assert.ok(valueEnd > valueStart, `incomplete ${element} classes`)
  return source.slice(valueStart, valueEnd).split(/\s+/)
}

test('message barrage consumes intimate layout values in both responsive lane sets', () => {
  const component = readSource('src/components/StarrySky/MessageBarrage.tsx')
  const styles = readSource('src/index.css')

  assert.match(component, /intimate\?: boolean/)
  assert.match(component, /getBarrageLayout\(intimate\)/)
  assert.match(component, /laneCount=\{desktopLaneCount\}/)
  assert.match(component, /laneCount=\{mobileLaneCount\}/)
  assert.match(component, /barrage-stage--intimate/)
  assert.match(component, /'--barrage-horizontal-gap': layout\.horizontalGap/)
  assert.match(component, /'--barrage-static-gap': layout\.staticGap/)
  assert.match(styles, /gap:\s*var\(--barrage-horizontal-gap\)/)
  assert.match(styles, /gap:\s*var\(--barrage-static-gap\)/)
})

test('intimate barrage measures visible pills and safely rebinds responsive observers', () => {
  const component = readSource('src/components/StarrySky/MessageBarrage.tsx')

  assert.match(component, /useLayoutEffect/)
  assert.match(component, /useRef/)
  assert.match(component, /useState/)
  assert.match(component, /getSafeBarrageLaneCount/)
  assert.match(component, /ref=\{stageRef\}/)
  assert.match(component, /stage\.getBoundingClientRect\(\)\.height/)
  assert.match(component, /querySelectorAll<HTMLElement>\('\.barrage-item'\)/)
  assert.match(component, /Number\.isFinite\(height\) && height > 0/)
  assert.match(component, /Math\.max\(\.\.\.itemHeights\)/)

  assert.match(component, /maxLaneCount: layout\.desktopLaneCount/)
  assert.match(component, /maxLaneCount: layout\.mobileLaneCount/)
  assert.match(component, /messageCount: messages\.length/)
  assert.match(component, /minimumGap: layout\.minimumVerticalGap/)
  assert.match(component, /const desktopLaneCount = intimate/)
  assert.match(component, /const mobileLaneCount = intimate/)

  assert.match(component, /measure\(\)\s*\n\s*const observer/)
  assert.match(
    component,
    /const scheduleMeasure = \(\) => \{\s*if \(frameId !== null\) cancelAnimationFrame\(frameId\)\s*frameId = requestAnimationFrame/,
  )
  assert.match(component, /setMeasurement\(\(current\) => \{[\s\S]*return current/)
  assert.match(component, /new ResizeObserver\(scheduleMeasure\)/)
  assert.match(component, /observer\?\.observe\(stage\)/)
  assert.match(component, /observer\?\.observe\(item\)/)
  assert.match(component, /matchMedia\('\(max-width: 640px\)'\)/)
  assert.match(component, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(component, /addEventListener\('resize', scheduleMeasure\)/)
  assert.match(component, /widthQuery\.addEventListener\('change', scheduleMeasure\)/)
  assert.match(component, /motionQuery\.addEventListener\('change', scheduleMeasure\)/)
  assert.match(component, /cancelAnimationFrame\(frameId\)/)
  assert.match(component, /removeEventListener\('resize', scheduleMeasure\)/)
  assert.match(component, /widthQuery\.removeEventListener\('change', scheduleMeasure\)/)
  assert.match(component, /motionQuery\.removeEventListener\('change', scheduleMeasure\)/)
  assert.match(component, /observer\?\.disconnect\(\)/)
  assert.match(
    component,
    /\[messages, intimate, fill, immersive, desktopLaneCount, mobileLaneCount\]/,
  )

  assert.match(component, /className={`barrage-lanes \$\{className\}`} aria-hidden="true"/)
  assert.match(component, /className="barrage-static-list" aria-label=/)
  assert.match(component, /tabIndex=\{0\}/)
})

test('fill barrage renders measured duplicate loop units without changing the regular branch', () => {
  const component = readSource('src/components/StarrySky/MessageBarrage.tsx')

  assert.match(component, /fill\?: boolean/)
  assert.match(component, /getBarrageFillRepeatCount/)
  assert.match(component, /getBarrageFillDuration/)
  assert.match(component, /stage\.getBoundingClientRect\(\)\.width/)
  assert.match(component, /!intimate && !fill/)
  assert.match(component, /\[messages, intimate, fill, immersive, desktopLaneCount, mobileLaneCount\]/)

  assert.match(component, /const FilledBarrageLane/)
  assert.match(component, /className="barrage-lane barrage-lane--fill"/)
  assert.match(component, /className="barrage-fill-probe"/)
  assert.match(component, /className="barrage-fill-unit"/)
  assert.match(component, /className="barrage-fill-sequence"/)
  assert.match(component, /Array\.from\(\{ length: 2 \}/)
  assert.match(component, /unitIndex}-\$\{repeatIndex}-\$\{item\.id}-\$\{messageIndex/)
  assert.match(component, /getComputedStyle\(probe\)\.columnGap/)
  assert.match(component, /probe\.getBoundingClientRect\(\)\.width/)
  assert.match(component, /observer\?\.observe\(probe\)/)
  assert.match(component, /\[stageWidth, lane, horizontalGap\]/)
  assert.match(component, /if \(fill\)[\s\S]*<FilledBarrageLane/)

  assert.match(component, /const contentLength = lane\.reduce/)
  assert.match(component, /className="barrage-lane" style=\{style\}/)
  assert.match(component, /observer\?\.disconnect\(\)/)
})

test('fill barrage animation loops two units without the regular offscreen entry point', () => {
  const styles = readSource('src/index.css')
  const keyframeStart = styles.indexOf('@keyframes barrage-fill-travel')
  assert.notEqual(keyframeStart, -1)
  const keyframeEnd = styles.indexOf('\n}', keyframeStart)
  assert.ok(keyframeEnd > keyframeStart)
  const fillKeyframes = styles.slice(keyframeStart, keyframeEnd + 2)

  assert.match(fillKeyframes, /translate3d\(0,\s*-50%,\s*0\)/)
  assert.match(fillKeyframes, /translate3d\(-50%,\s*-50%,\s*0\)/)
  assert.doesNotMatch(fillKeyframes, /100vw/)
  assert.match(styles, /\.barrage-lane--fill\s*\{[^}]*gap:\s*0;[^}]*animation:\s*barrage-fill-travel var\(--fill-duration\) linear var\(--lane-delay\) infinite;/s)
  assert.match(styles, /\.barrage-fill-unit,[\s\S]*\.barrage-fill-sequence,[\s\S]*\.barrage-fill-probe\s*\{[^}]*display:\s*flex;[^}]*flex:\s*none;/s)
  assert.match(styles, /\.barrage-fill-sequence\s*\{[^}]*padding-right:\s*var\(--barrage-horizontal-gap\);/s)
  assert.match(styles, /\.barrage-fill-probe\s*\{[^}]*position:\s*absolute;[^}]*visibility:\s*hidden;/s)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.barrage-lanes\s*\{[^}]*display:\s*none;/s)
})

test('sidebar and starry sky wire intimate and fill modes independently', () => {
  const sidebar = readSource('src/components/StarrySky/AssistantSidebar.tsx')
  const starrySky = readSource('src/components/StarrySky/StarrySky.tsx')

  assert.match(sidebar, /intimateMode: boolean/)
  assert.match(sidebar, /onChangeIntimateMode: \(enabled: boolean\) => void/)
  assert.match(sidebar, /aria-label="亲密模式"/)
  assert.match(sidebar, /onClick=\{\(\) => onChangeIntimateMode\(!intimateMode\)\}/)
  assert.match(sidebar, /fillMode: boolean/)
  assert.match(sidebar, /onChangeFillMode: \(enabled: boolean\) => void/)
  assert.match(sidebar, /aria-label="填充模式"/)
  assert.match(sidebar, /循环补齐弹幕，减少屏幕空白/)
  assert.match(sidebar, /onClick=\{\(\) => onChangeFillMode\(!fillMode\)\}/)

  assert.match(starrySky, /useState\(createInitialBarragePreferences\)/)
  assert.match(starrySky, /const barrageMode = barragePreferences\.immersive/)
  assert.match(starrySky, /const intimateMode = barragePreferences\.intimate/)
  assert.match(starrySky, /const fillMode = barragePreferences\.fill/)
  assert.match(starrySky, /setBarragePreferences\(createInitialBarragePreferences\(\)\)/)
  assert.match(starrySky, /setBarragePreference\(current, 'immersive', enabled\)/)
  assert.match(starrySky, /setBarragePreference\(current, 'intimate', enabled\)/)
  assert.match(starrySky, /setBarragePreference\(current, 'fill', enabled\)/)
  assert.match(starrySky, /intimateMode=\{intimateMode\}/)
  assert.match(starrySky, /onChangeIntimateMode=\{handleIntimateModeChange\}/)
  assert.match(starrySky, /fillMode=\{fillMode\}/)
  assert.match(starrySky, /onChangeFillMode=\{handleFillModeChange\}/)
  assert.match(starrySky, /intimate=\{intimateMode\}/)
  assert.match(starrySky, /fill=\{fillMode\}/)
})

test('barrage switch thumbs stay inside the track and follow each checked state', () => {
  const sidebar = readSource('src/components/StarrySky/AssistantSidebar.tsx')
  const switches = [
    ['弹幕模式', 'barrageMode'],
    ['亲密模式', 'intimateMode'],
    ['填充模式', 'fillMode'],
  ] as const

  for (const [label, state] of switches) {
    const switchSource = getSwitchSource(sidebar, label)
    const trackClasses = getClassTokens(switchSource, 'button')
    const thumbClasses = getClassTokens(switchSource, 'span')

    for (const token of ['relative', 'h-7', 'w-12', 'border']) {
      assert.ok(trackClasses.includes(token), `${label} track missing ${token}`)
    }
    for (const token of ['absolute', 'left-0', 'top-1', 'h-5', 'w-5']) {
      assert.ok(thumbClasses.includes(token), `${label} thumb missing ${token}`)
    }

    assert.ok(
      switchSource.includes('${' + state + " ? 'translate-x-6' : 'translate-x-1'}"),
      `${label} must move right only when enabled`,
    )
    assert.ok(switchSource.includes('type="button"'))
    assert.ok(switchSource.includes('role="switch"'))
    assert.ok(switchSource.includes(`aria-label="${label}"`))
    assert.ok(switchSource.includes(`aria-checked={${state}}`))
  }

  const trackWidth = 48
  const borderWidth = 1
  const thumbWidth = 20
  const bounds = (translation: number) => {
    const left = borderWidth + translation
    return { left, right: left + thumbWidth, center: left + thumbWidth / 2 }
  }
  const off = bounds(4)
  const on = bounds(24)

  assert.deepEqual(off, { left: 5, right: 25, center: 15 })
  assert.deepEqual(on, { left: 25, right: 45, center: 35 })
  assert.ok(off.left >= 0 && off.right <= trackWidth)
  assert.ok(on.left >= 0 && on.right <= trackWidth)
  assert.ok(off.center < trackWidth / 2)
  assert.ok(on.center > trackWidth / 2)
})
