// 验证：焦点落在增益滑块 / 数值框里时，Ctrl+Z 还能不能撤回（这是「两个增益也能撤销」的关键场景）。
const BASE = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = (await (await fetch(`${BASE}/json/list`)).json()).find((item) => item.type === 'page' && item.url.includes('trim.html'))
  ?? await (await fetch(`${BASE}/json/new?${encodeURIComponent('http://localhost:5188/harness/trim.html')}`, { method: 'PUT' })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
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
const key = async (keyName, code, virtualKeyCode, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers });
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5188/harness/trim.html' });
await sleep(2500);

const setRange = (selector, value, focus = true) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  ${focus ? 'el.focus();' : ''}
  return { value: el.value, active: document.activeElement === el };
})()`);
const dbValue = () => evaluate(`document.querySelector('input[aria-label="整段增益 dB 数值"]').value`);

const slider = await setRange('input[aria-label="整段增益"]', 4.5);
console.log('拖滑块后：', slider, 'dB =', await dbValue());
await key('z', 'KeyZ', 90, 2);
await sleep(220);
console.log('焦点在滑块时 Ctrl+Z 后 dB =', await dbValue(), '（期望 0）');

// 再试数值框
await setRange('input[aria-label="整段增益 dB 数值"]', -3);
await sleep(120);
console.log('数值框聚焦后 dB =', await dbValue(), 'active =', await evaluate(`document.activeElement.getAttribute('aria-label')`));
await key('z', 'KeyZ', 90, 2);
await sleep(220);
console.log('焦点在数值框时 Ctrl+Z 后 dB =', await dbValue(), '（期望 0）');

socket.close();
