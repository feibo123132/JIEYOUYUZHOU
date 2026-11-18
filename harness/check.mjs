const BASE = 'http://127.0.0.1:9333';

const listTargets = async () => (await fetch(`${BASE}/json/list`)).json();

const openTarget = async (url) => {
  const target = await (await fetch(`${BASE}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  return target;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const page = (await listTargets()).find((item) => item.type === 'page' && item.url.includes('trim.html'))
  ?? await openTarget('http://localhost:5188/harness/trim.html');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++sequence;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.result?.exceptionDetails) throw new Error(JSON.stringify(result.result.exceptionDetails));
  return result.result?.result?.value;
};

const mouse = (type, x, y) => send('Input.dispatchMouseEvent', {
  type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
});

const key = async (keyName, code, virtualKeyCode, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers });
};

const rectOf = (selector) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
})()`);

const click = async (selector) => {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`click failed: ${selector}`);
};

const setRange = (selector, value) => evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return el.value;
})()`);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:5188/harness/trim.html' });
await sleep(2500);

const ready = await evaluate(`Boolean(document.querySelector('dialog[open] canvas.cursor-crosshair'))`);
check('裁剪弹窗挂载成功', ready === true);

// 1) 在波形上框选一段
const surface = await rectOf('canvas.cursor-crosshair');
const y = surface.y + surface.h / 2;
const from = surface.x + 90;
const to = surface.x + 260;
await mouse('mousePressed', from, y);
await mouse('mouseMoved', from + 40, y);
await mouse('mouseMoved', from + 90, y);
await mouse('mouseMoved', to, y);
await mouse('mouseReleased', to, y);
await sleep(220);

const commented = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === '评论选区');
  return button ? 'present' : 'missing';
})()`);
check('框选后出现「评论选区」入口', commented === 'present', commented);

// 2) 评论选区
const commentDisabled = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === '评论选区');
  return button ? button.disabled : 'missing';
})()`);
check('「评论选区」按钮可用', commentDisabled === false, commentDisabled);
await click('button[title*="给框选的这段"]');
await sleep(250);

const spanState = await evaluate(`(() => ({
  flags: document.querySelectorAll('button[aria-label^="移动或编辑片段评论"]').length,
  handles: document.querySelectorAll('button[aria-label*="的终点"]').length,
  editor: Boolean(document.getElementById('audio-marker-editor')),
  pill: [...document.querySelectorAll('button')].some(node => node.textContent?.trim() === '片段评论'),
}))()`);
check('波形出现区间评论（旗标 + 终点把手）', spanState.flags === 1 && spanState.handles === 1, spanState);
check('评论编辑器自动打开', spanState.editor === true);
check('区间内显示「片段评论」摘要', spanState.pill === true);

// 3) 写主题，摘要同步
await evaluate(`(() => {
  const input = document.querySelector('#audio-marker-editor input[type="text"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '副歌这句气不够');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input.value;
})()`);
await sleep(160);
const pillText = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === '副歌这句气不够');
  return button ? button.textContent.trim() : null;
})()`);
check('波形摘要跟着主题变化', pillText === '副歌这句气不够', pillText);

// 4) 拖终点把手把区间拉长（先把波形滚回视野，编辑器聚焦会把页面往下带）
await evaluate(`document.querySelector('canvas.cursor-crosshair').scrollIntoView({ block: 'center' })`);
await sleep(200);
const handle = await rectOf('button[aria-label*="的终点"]');
const beforeEnd = await evaluate(`(() => {
  const chip = [...document.querySelectorAll('button')].map(node => node.textContent || '').find(text => /\\d:\\d\\d\\.\\d{3}–\\d:\\d\\d\\.\\d{3}/.test(text));
  return chip ?? null;
})()`);
await mouse('mousePressed', handle.x + handle.w / 2, handle.y + handle.h / 2);
await mouse('mouseMoved', handle.x + 40, handle.y + handle.h / 2);
await mouse('mouseMoved', handle.x + 90, handle.y + handle.h / 2);
await mouse('mouseReleased', handle.x + 90, handle.y + handle.h / 2);
await sleep(220);
const afterEnd = await evaluate(`(() => {
  const chip = [...document.querySelectorAll('button')].map(node => node.textContent || '').find(text => /\\d:\\d\\d\\.\\d{3}–\\d:\\d\\d\\.\\d{3}/.test(text));
  return chip ?? null;
})()`);
check('拖动终点把手能拉长区间', beforeEnd !== afterEnd, { beforeEnd, afterEnd });

// 5) 保存后 markers 带 end
await click('footer button.bg-orange-400');
await sleep(200);
const saved = await evaluate(`window.__saved`);
check('保存后 markers[0].end 存在', Boolean(saved?.markers?.[0]?.end !== undefined), saved?.markers);

// 6) 整段增益 → 撤回 / 重做
const dbValue = () => evaluate(`document.querySelector('input[aria-label="整段增益 dB 数值"]').value`);
await setRange('input[aria-label="整段增益"]', 4.5);
await sleep(160);
check('拖动整段增益生效', (await dbValue()) === '4.5', await dbValue());

await key('z', 'KeyZ', 90, 2);
await sleep(200);
check('Ctrl+Z 撤回整段增益', (await dbValue()) === '0', await dbValue());

await key('y', 'KeyY', 89, 2);
await sleep(200);
check('Ctrl+Y 重做整段增益', (await dbValue()) === '4.5', await dbValue());

// 7) 局部增益 → 撤回
const gainUndo = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')];
  const mode = buttons.find(node => node.textContent?.trim() === '局部增益');
  mode.click();
  return true;
})()`);
check('切到局部增益模式', gainUndo === true);
await sleep(200);
// 选一段：直接点已有选区标签（评论选区还在），此处用波形再框一次
await evaluate(`document.querySelector('canvas.cursor-crosshair').scrollIntoView({ block: 'center' })`);
await sleep(200);
const surface2 = await rectOf('canvas.cursor-crosshair');
const y2 = surface2.y + surface2.h / 2;
await mouse('mousePressed', surface2.x + 60, y2);
await mouse('mouseMoved', surface2.x + 90, y2);
await mouse('mouseMoved', surface2.x + 140, y2);
await mouse('mouseReleased', surface2.x + 140, y2);
await sleep(200);
const rangesBefore = await evaluate(`document.querySelectorAll('button[class*="border-sky-200/25"]').length`);
await setRange('input[aria-label="本次调整"]', -6);
await sleep(120);
await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === '叠加到选区');
  button.click();
  return button.disabled;
})()`);
await sleep(220);
const gainAfter = await evaluate(`document.querySelector('input[aria-label="整段增益 dB 数值"]').value`);
const rangeChips = await evaluate(`[...document.querySelectorAll('button')].filter(node => /–.*dB/.test(node.textContent || '')).length`);
check('局部增益写入区间', rangeChips > 0, { rangesBefore, rangeChips, gainAfter });
await key('z', 'KeyZ', 90, 2);
await sleep(220);
const rangeChipsAfterUndo = await evaluate(`[...document.querySelectorAll('button')].filter(node => /–.*dB/.test(node.textContent || '')).length`);
check('Ctrl+Z 撤回局部增益', rangeChipsAfterUndo === 0, { rangeChipsAfterUndo });
await key('y', 'KeyY', 89, 2);
await sleep(220);
const rangeChipsAfterRedo = await evaluate(`[...document.querySelectorAll('button')].filter(node => /–.*dB/.test(node.textContent || '')).length`);
check('Ctrl+Y 恢复局部增益', rangeChipsAfterRedo > 0, { rangeChipsAfterRedo });

// 8) Ctrl+S
const before = await evaluate(`window.__saveCount`);
await key('s', 'KeyS', 83, 2);
await sleep(300);
const after = await evaluate(`window.__saveCount`);
check('Ctrl+S 触发保存', after === before + 1, { before, after });

// 9) 焦点在留言框时 Ctrl+S 仍然生效
await evaluate(`document.querySelector('textarea').focus()`);
const before2 = await evaluate(`window.__saveCount`);
await key('s', 'KeyS', 83, 2);
await sleep(300);
const after2 = await evaluate(`window.__saveCount`);
check('留言框里 Ctrl+S 也能保存', after2 === before2 + 1, { before2, after2 });

console.log(`\n${results.filter(r => r.pass).length}/${results.length} 通过`);
if (results.some(r => !r.pass)) process.exitCode = 1;
socket.close();
