// 验证：焦点停在增益控件上时，弹窗快捷键不会抢走控件自己的按键。
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
await sleep(2200);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
};

const footer = () => evaluate(`document.querySelector('dialog[open]').textContent`);
const sliderValue = () => evaluate(`document.querySelector('input[aria-label="整段增益"]').value`);

// 1) 焦点在滑块上按方向键：改的是滑块，不是播放指针
await evaluate(`(() => { const el = document.querySelector('input[aria-label="整段增益"]'); el.focus(); return document.activeElement === el; })()`);
const pointerBefore = (await footer()).match(/指针（?[^0-9]*(\d:\d\d\.\d{3})/)?.[1] ?? null;
await key('ArrowRight', 'ArrowRight', 39);
await sleep(200);
const slid = await sliderValue();
const pointerAfter = (await footer()).match(/指针（?[^0-9]*(\d:\d\d\.\d{3})/)?.[1] ?? null;
check('滑块上的 → 调的是增益', Number(slid) > 0, { slid });
check('滑块上的 → 不动播放指针', pointerBefore === pointerAfter, { pointerBefore, pointerAfter });

// 2) 同一个位置 Ctrl+Z 仍然撤回增益
await key('z', 'KeyZ', 90, 2);
await sleep(220);
check('滑块焦点下 Ctrl+Z 仍撤回增益', (await sliderValue()) === '0', { after: await sliderValue() });

// 3) 数字框里退格只改数字，不删片段
await evaluate(`(() => {
  const el = document.querySelector('input[aria-label="整段增益 dB 数值"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '-12');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  el.setSelectionRange?.(el.value.length, el.value.length);
  return true;
})()`);
await sleep(150);
const numberValue = () => evaluate(`document.querySelector('input[aria-label="整段增益 dB 数值"]').value`);
const valueBefore = await numberValue();
const cutsBefore = (await footer()).match(/已删 (\d+) 段/)?.[1] ?? '0';
await key('Backspace', 'Backspace', 8);
await sleep(200);
const valueAfter = await numberValue();
const cutsAfter = (await footer()).match(/已删 (\d+) 段/)?.[1] ?? '0';
check('数字框里退格改的是数字（原生行为）', valueBefore !== valueAfter, { valueBefore, valueAfter });
check('数字框里退格不会删片段', cutsBefore === cutsAfter, { cutsBefore, cutsAfter });

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
if (results.some((pass) => !pass)) process.exitCode = 1;
socket.close();
