import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('score viewer isolates iPad gestures from page zoom and renders in the document top layer', () => {
  const source = readFileSync(new URL('../src/components/SongRequest/ScoreViewer.tsx', import.meta.url), 'utf8')

  assert.match(source, /import \{ createPortal \} from 'react-dom'/)
  assert.match(source, /createPortal\([\s\S]*document\.body/)
  assert.match(source, /touchAction: 'pan-x pan-y'/)
  assert.match(source, /overscrollBehavior: 'none'/)
  assert.match(source, /\bbg-black\b/)
  assert.doesNotMatch(source, /bg-black\/97/)
})
