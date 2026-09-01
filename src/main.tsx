import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/animations.css'

let clickAudioCtx: AudioContext | null = null
let clickBuffer: AudioBuffer | null = null
let clickGain: GainNode | null = null
let delegatedSoundDispatch = false

const baseUrl = (import.meta.env.BASE_URL || '/').endsWith('/') ? (import.meta.env.BASE_URL || '/') : (import.meta.env.BASE_URL || '/') + '/'
const getPublicUrl = (name: string) => baseUrl + encodeURI(name)

async function initClickAudio() {
  try {
    if (!clickAudioCtx) {
      clickAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      clickGain = clickAudioCtx.createGain()
      clickGain.gain.value = 0.9
      clickGain.connect(clickAudioCtx.destination)
    }
    if (!clickBuffer) {
      const res = await fetch(getPublicUrl('pop.mp3'))
      const ab = await res.arrayBuffer()
      clickBuffer = await clickAudioCtx.decodeAudioData(ab)
    }
  } catch {}
}

function ensureAudioUnlocked() {
  try { if (clickAudioCtx && clickAudioCtx.state !== 'running') clickAudioCtx.resume() } catch {}
}

function playClickSound() {
  ensureAudioUnlocked()
  if (!clickAudioCtx || !clickBuffer || !clickGain) {
    initClickAudio().then(() => {
      try {
        if (!clickAudioCtx || !clickBuffer || !clickGain) return
        const src = clickAudioCtx.createBufferSource()
        src.buffer = clickBuffer
        src.connect(clickGain)
        src.start(0)
      } catch {}
    })
    return
  }
  try {
    const src = clickAudioCtx.createBufferSource()
    src.buffer = clickBuffer
    src.connect(clickGain)
    src.start(0)
  } catch {}
}

;(window as any).playClickSound = () => {
  if (!delegatedSoundDispatch) playClickSound()
}

function playDelegatedSound() {
  delegatedSoundDispatch = true
  playClickSound()
  queueMicrotask(() => { delegatedSoundDispatch = false })
}

const INTERACTION_SOUND_SELECTOR = 'button, a[href], select, option, summary, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], input[type="range"], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]'
const ENTER_CLICK_SELECTOR = 'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]'
const SPACE_CLICK_SELECTOR = 'button, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], summary, [role="button"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"]'
const KEYBOARD_DIRECT_SOUND_SELECTOR = 'select, input[type="range"], [role="tab"], [role="slider"]'

function handleGlobalClickSound(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest(INTERACTION_SOUND_SELECTOR) : null
  if (!target) return
  playDelegatedSound()
}

function handleGlobalKeySound(event: KeyboardEvent) {
  if (event.repeat) return
  const target = event.target instanceof Element ? event.target.closest(INTERACTION_SOUND_SELECTOR) : null
  if (!target) return
  const selector = event.key === 'Enter' ? ENTER_CLICK_SELECTOR : event.key === ' ' ? SPACE_CLICK_SELECTOR : ''
  const producesClick = Boolean(selector && target.closest(selector))
  if (!producesClick && target.matches(KEYBOARD_DIRECT_SOUND_SELECTOR)) playDelegatedSound()
}

initClickAudio()
window.addEventListener('pointerdown', () => { ensureAudioUnlocked() }, { once: true })
document.addEventListener('click', handleGlobalClickSound, true)
document.addEventListener('keydown', handleGlobalKeySound, true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
