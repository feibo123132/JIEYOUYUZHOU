import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './styles/animations.css'

let clickAudioCtx: AudioContext | null = null
let clickBuffer: AudioBuffer | null = null
let clickGain: GainNode | null = null

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

;(window as any).playClickSound = () => {
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

initClickAudio()
window.addEventListener('pointerdown', () => { ensureAudioUnlocked() }, { once: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
