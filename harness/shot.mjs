const BASE = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = (await (await fetch(`${BASE}/json/list`)).json()).find((item) => item.type === 'page' && item.url.includes('trim.html'));
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => { socket.onopen = resolve; });
let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++sequence;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const rectOf = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5188/harness/trim.html' });
await sleep(2500);

const surface = await rectOf('canvas.cursor-crosshair');
const y = surface.y + surface.h / 2;
await mouse('mousePressed', surface.x + 150, y);
await mouse('mouseMoved', surface.x + 220, y);
await mouse('mouseMoved', surface.x + 330, y);
await mouse('mouseMoved', surface.x + 430, y);
await mouse('mouseReleased', surface.x + 430, y);
await sleep(200);
await evaluate(`[...document.querySelectorAll('button')].find(n => n.textContent?.trim() === '评论选区').click()`);
await sleep(250);
await evaluate(`(() => {
  const input = document.querySelector('#audio-marker-editor input[type="text"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '这句换气太急');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.blur();
})()`);
await sleep(150);
await evaluate(`document.querySelector('canvas.cursor-crosshair').scrollIntoView({ block: 'center' })`);
await sleep(250);

await evaluate(`[...document.querySelectorAll('button')].find(n => n.textContent?.trim() === 'M')?.click()`);
await sleep(150);

const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync('harness/segment-comment.png', Buffer.from(shot.result.data, 'base64'));
console.log('saved');
socket.close();
