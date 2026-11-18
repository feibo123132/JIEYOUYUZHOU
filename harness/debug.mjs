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
await send('Page.navigate', { url: 'http://localhost:5188/harness/trim.html' });
await sleep(2500);

const surface = await rectOf('canvas.cursor-crosshair');
const y = surface.y + surface.h / 2;
await mouse('mousePressed', surface.x + 90, y);
await mouse('mouseMoved', surface.x + 130, y);
await mouse('mouseMoved', surface.x + 200, y);
await mouse('mouseMoved', surface.x + 260, y);
await mouse('mouseReleased', surface.x + 260, y);
await sleep(200);
await evaluate(`[...document.querySelectorAll('button')].find(n => n.textContent?.trim() === '评论选区').click()`);
await sleep(250);

const handle = await rectOf('button[aria-label*="的终点"]');
console.log('handle rect', handle);
const bandBefore = await evaluate(`(() => { const el = [...document.querySelectorAll('div')].find(n => n.className.includes('border-dashed') && n.className.includes('border-current')); const r = el.getBoundingClientRect(); return { left: r.left, width: r.width, dashed: getComputedStyle(el).borderLeftStyle }; })()`);
console.log('band before', bandBefore);

const px = handle.x + handle.w / 2;
const py = handle.y + handle.h / 2;
await mouse('mousePressed', px, py);
await sleep(80);
console.log('after down class:', await evaluate(`document.querySelector('button[aria-label*="的终点"]').className`));
await mouse('mouseMoved', px + 30, py);
await sleep(60);
await mouse('mouseMoved', px + 80, py);
await sleep(60);
console.log('mid-drag class:', await evaluate(`document.querySelector('button[aria-label*="的终点"]').className`));
console.log('mid-drag band:', await evaluate(`(() => { const el = [...document.querySelectorAll('div')].find(n => n.className.includes('border-dashed') && n.className.includes('border-current')); const r = el.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width) }; })()`));
console.log('mid-drag tag:', await evaluate(`[...document.querySelectorAll('span')].map(n => n.textContent).filter(t => /^\\d:\\d\\d\\.\\d{3}$/.test(t || ''))`));
await mouse('mouseReleased', px + 80, py);
await sleep(200);
console.log('list chip:', await evaluate(`[...document.querySelectorAll('button')].map(n => n.textContent || '').filter(t => t.includes('–'))[0]`));
console.log('editor header:', await evaluate(`document.getElementById('audio-marker-editor')?.textContent?.slice(0, 40)`));
socket.close();
