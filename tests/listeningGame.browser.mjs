// Runs against a local in-memory cloud function; never reads or writes production data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
const { createHandler } = require('../cloudfunctions/songRequestSync');
const { mutateListeningGame } = require('../cloudfunctions/songRequestSync/listeningGame');
const songs = require('../cloudfunctions/songRequestSync/quizCatalog.json').slice(0, 24);
const assignments = Object.fromEntries(songs.map(song => [song.id, 'warmup']));
const owner = { alias: '2421415030@qq.com', password: 'fixture-only-password' };
const ownerId = crypto.createHash('sha256').update(owner.alias).digest('hex');
let documents = { [ownerId]: { alias: owner.alias, passwordSalt: 'fixture-salt', passwordHash: crypto.scryptSync(owner.password, 'fixture-salt', 32).toString('hex'), quizLibraryAssignments: assignments } };
let transactions = Promise.resolve();
const db = { runTransaction(run) {
  const result = transactions.then(async () => {
    const draft = structuredClone(documents);
    const result = await run({ collection: () => ({ doc: id => ({ get: async () => ({ data: draft[id] ?? null }), set: async value => { draft[id] = value; } }) }) });
    documents = draft; return result;
  });
  transactions = result.catch(() => {}); return result;
} };
const handlerFor = uid => createHandler({ getWorkspace: async id => documents[id] ?? null,
  getArtistSettings: async () => ({ catalog: { songs } }), getGameCallerId: () => uid,
  mutateListeningGame: (request, caller) => mutateListeningGame(db, request, caller, new Date().toISOString()),
});
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Game from './src/components/SongRequest/ListeningGamePage.tsx';
    Object.defineProperty(document,'hidden',{get:()=>false});
    const params=new URL(location.href).searchParams;
    const manager=params.has('host');
    if(params.has('ipad')){
      Object.defineProperty(navigator,'platform',{value:'MacIntel'});
      Object.defineProperty(navigator,'maxTouchPoints',{value:5});
    }
    createRoot(document.getElementById('root')).render(<Game session={manager?${JSON.stringify(owner)}:null} manager={manager} songs={${JSON.stringify(songs)}} assignments={${JSON.stringify(assignments)}} initialRoomId={new URL(location.href).searchParams.get('game')} onBack={()=>{}}/>);`, resolveDir: process.cwd(), loader: 'jsx' },
  plugins: [{ name: 'fixture-cloud', setup(builder) {
    builder.onResolve({ filter: /\/services\/tcb$/ }, () => ({ path: 'fixture-tcb', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const ensureSignIn=async()=>{};
      export const tcbApp={callFunction:async({data})=>{
        if(window.failSync)throw new Error('CLOUD_UNAVAILABLE');
        let uid=sessionStorage.getItem('fixture-uid');if(!uid){uid=crypto.randomUUID();sessionStorage.setItem('fixture-uid',uid)}
        const result=await fetch('/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data,uid})}).then(r=>r.json());
        window.lastCloud=result;return {result};}};`, loader: 'js' }));
  } }], bundle: true, write: false, format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
});
const assets = resolve('dist/assets');
const css = readdirSync(assets).filter(file => file.endsWith('.css'))
  .map(file => readFileSync(resolve(assets, file), 'utf8')).join('\n');
const petAssets = resolve('public/dsh-pet-7340');
const petTypes = { '.webm': 'video/webm', '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = createServer((request, response) => {
  if (request.url?.startsWith('/dsh-pet-7340/')) {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(petAssets, path.slice('/dsh-pet-7340/'.length));
      if (file.startsWith(petAssets + sep) && statSync(file, { throwIfNoEntry: false })?.isFile()) {
        response.setHeader('Content-Type', petTypes[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(response);
        return;
      }
    } catch {}
    response.writeHead(404).end();
    return;
  }
  if (request.url === '/sync') {
    let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', async () => {
      try { const { data, uid } = JSON.parse(body); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await handlerFor(uid)(data))); }
      catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: error.message })); }
    }); return;
  }
  response.setHeader('Content-Type', request.url === '/app.js' ? 'text/javascript' : request.url === '/style.css' ? 'text/css' : 'text/html');
  response.end(request.url === '/app.js' ? bundle.outputFiles[0].text : request.url === '/style.css' ? css : '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#030306"><div id="root"></div><script type="module" src="/app.js"></script></body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
if (process.env.LISTENING_GAME_PREVIEW) {
  console.log(`Local fixture: ${base}?host=1`);
  await new Promise(() => {});
}
const profile = resolve('.codex-temp/listening-game-chrome-' + Date.now());
mkdirSync(profile, { recursive: true });
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let chromeDiagnostics = '';
chrome.stderr.on('data', chunk => { chromeDiagnostics = (chromeDiagnostics + chunk.toString()).slice(-2000); });
chrome.on('error', error => { chromeDiagnostics += error.message; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const errors = [];
const sessions = [];
try {
  for (let i = 0; !existsSync(resolve(profile, 'DevToolsActivePort')); i++) { if (i > 100) throw new Error('Chrome startup timed out: ' + chromeDiagnostics); await sleep(100); }
  const [port, browserPath] = readFileSync(resolve(profile, 'DevToolsActivePort'), 'utf8').trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let counter = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) {
      const { resolve, reject, timeout } = pending.get(message.id); pending.delete(message.id); clearTimeout(timeout);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++counter;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const page = async url => {
    const { targetId } = await call('Target.createTarget', { url });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    sessions.push(sessionId);
    await call('Runtime.enable', {}, sessionId);
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const wait = async expression => {
      for (let i = 0; !(await evaluate(expression)); i++) { if (i > 80) throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`); await sleep(100); }
    };
    const click = async text => { await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`); await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); await sleep(80); };
    const capture = async (name, width, height) => {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
      await sleep(100);
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      writeFileSync(resolve('.codex-temp', name), Buffer.from(shot.data, 'base64'));
    };
    return { evaluate, wait, click, capture, sessionId };
  };
  const host = await page(base + '?host=1');
  await host.click('创建现场游戏');
  await host.wait(`document.body.innerText.includes('选择本轮演奏歌曲')`);
  assert.equal(await host.evaluate(`document.body.innerText.includes('游客扫码加入')`), false);
  assert.equal(await host.evaluate(`document.querySelectorAll('input[aria-label="游客游戏链接"]').length`), 0);
  const guest = await page(base);
  await guest.wait(`document.body.innerText.includes('你已到场')`);
  const guestPet = 'button[aria-label="和鲸鱼娘互动"]';
  await guest.wait(`document.querySelector('.dsh-pet-root[data-surface="guest"] ${guestPet}')`);
  assert.equal(await guest.evaluate(`!!document.querySelector('button[aria-haspopup="dialog"]')`), false);
  const ipad = await page(base + '?host=1&ipad=1');
  await ipad.wait(`document.querySelector('.dsh-pet-root[data-surface="manager"] picture img')?.naturalWidth > 0`);
  assert.equal(await ipad.evaluate(`document.querySelectorAll('.dsh-pet-root video').length`), 0);
  await host.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(songs[0].title)})&&b.textContent.includes('简单')).click()`);
  await guest.wait(`document.querySelectorAll('[role="radio"]').length===16`);
  assert.equal(await guest.evaluate('window.lastCloud.room.answerSongId'), undefined);
  await guest.evaluate(`[...document.querySelectorAll('[role="radio"]')].find(b=>b.textContent.includes(${JSON.stringify(songs[0].title)})).click()`);
  await guest.wait(`!!document.querySelector('[role="radio"][aria-checked="true"]')`);
  assert.equal(await guest.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('等待管理员开放提交')).disabled`), true);
  await guest.capture('listening-game-mobile.png', 390, 844);
  assert.equal(await guest.evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'mobile layout must not overflow');
  const petPoint = await guest.evaluate(`(() => {
    const pet = document.querySelector('${guestPet}').getBoundingClientRect();
    const x = pet.left + pet.width / 2;
    const y = pet.top + pet.height / 2;
    return document.elementFromPoint(x, y)?.matches('${guestPet}') ? { x, y } : null;
  })()`);
  assert.ok(petPoint, 'the floating mascot is reachable on mobile');
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [petPoint] }, guest.sessionId);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, guest.sessionId);
  await guest.wait(`document.querySelector('.dsh-pet-root[data-surface="guest"] [role="status"]')?.textContent.includes('听到熟悉的旋律了吗？')`);
  await host.capture('listening-game-host.png', 1280, 900);
  await host.click('开放提交');
  await guest.wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='提交答案'&&!b.disabled)`);
  await guest.click('提交答案');
  await guest.wait(`!!document.querySelector('dialog[open]')`);
  assert.equal(await guest.evaluate('window.lastCloud.room.submission.correct'), true);
  assert.equal(await guest.evaluate('window.lastCloud.room.phase'), 'open');
  await guest.click('知道了');
  await guest.wait(`!document.querySelector('dialog[open]')`);
  await call('Page.reload', {}, guest.sessionId);
  await guest.wait(`!!document.querySelector('dialog[open]')`);
  assert.equal(await guest.evaluate('window.lastCloud.room.submission.correct'), true);
  await guest.click('知道了');
  assert.equal(await guest.evaluate(`document.querySelectorAll('[role="radio"]:not(:disabled)').length`), 0);
  await host.wait(`document.body.innerText.includes('1 人已提交')`);
  const wrongGuest = await page(base);
  await wrongGuest.wait(`document.querySelectorAll('[role="radio"]').length===16`);
  await wrongGuest.evaluate(`[...document.querySelectorAll('[role="radio"]')].find(b=>!b.textContent.includes(${JSON.stringify(songs[0].title)})).click()`);
  await wrongGuest.click('提交答案');
  await wrongGuest.wait(`!!document.querySelector('dialog[open]')`);
  assert.equal(await wrongGuest.evaluate('window.lastCloud.room.submission.correct'), false);
  assert.equal(await wrongGuest.evaluate('window.lastCloud.room.answerSongId'), songs[0].id);
  await wrongGuest.click('知道了');
  await host.click('暂停提交');
  await host.click('结束本轮');
  await guest.wait(`document.body.innerText.includes('本轮已结束')`);
  assert.equal(await guest.evaluate('window.lastCloud.room.answerSongId'), songs[0].id);
  await host.click('选择下一首');
  await host.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(songs[1].title)})&&b.textContent.includes('简单')).click()`);
  await guest.wait(`document.body.innerText.includes('第 2 轮')`);
  assert.equal(await guest.evaluate(`document.querySelectorAll('[aria-checked="true"]').length`), 0, 'next round resets selection');
  assert.equal(await guest.evaluate(`new URL(location.href).searchParams.has('game')`), false);
  await host.click('结束本轮');
  await host.click('结束本场');
  await guest.wait(`document.body.innerText.includes('本场游戏已结束')`);
  await host.click('创建新游戏');
  await guest.wait(`document.body.innerText.includes('你已到场')`);
  await guest.evaluate(`window.failSync=true;window.dispatchEvent(new Event('online'))`);
  await guest.wait(`!!document.querySelector('[role="alert"]')`);
  await guest.evaluate(`window.failSync=false`);
  await guest.click('重新连接');
  await guest.wait(`!document.querySelector('[role="alert"]')`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks: ['real cloud handler with multiple browser pages', 'no QR settings', 'bare URL joins current game without login', '16 options and hidden answer before submission', 'can select before permission', 'submit locked before opening', 'mobile no overflow', 'immediate correct and incorrect result dialogs', 'submitted result restored after reload', 'open/submit/lock/end', 'same bare URL across rounds and new games', 'round selection reset', 'network failure and retry', 'no browser exceptions'], screenshots: ['listening-game-mobile.png', 'listening-game-host.png'] }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); socket.close();
  }
  chrome.kill();
  server.close();
}
