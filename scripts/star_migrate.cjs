/* 星空树洞 → 生命万岁 星星迁移工具（Node + @cloudbase/js-sdk + polyfill）
 * 用法:
 *   node scripts/star_migrate.cjs backup   # 全量备份两个集合到 scripts/star-migration-backup/
 *   node scripts/star_migrate.cjs plan     # 干跑：读 stars 未删除记录、比对 id 冲突，输出计划
 *   node scripts/star_migrate.cjs migrate  # 执行：将 stars 记录写入 life_stars（冲突则生成新 id）
 *   node scripts/star_migrate.cjs verify   # 校验：life_stars 应等于 4 + 迁移成功数
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ---------- 浏览器环境 polyfill ---------- */
const { MemoryStore } = (() => {
  let store = {};
  class MemoryStore {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }
    setItem(k, v) { store[k] = String(v); }
    removeItem(k) { delete store[k]; }
    clear() { store = {}; }
  }
  return { MemoryStore };
})();

globalThis.window = globalThis;
globalThis.localStorage = new MemoryStore();
globalThis.location = {
  search: '', href: 'https://tcb.local/', protocol: 'https:', host: 'tcb.local',
  hostname: 'tcb.local', origin: 'https://tcb.local', pathname: '/', hash: '',
  reload() {}, replace() {}, assign() {},
};
const fakeEl = () => ({ style: {}, setAttribute() {}, appendChild() {}, removeChild() {}, innerHTML: '', children: [] });
globalThis.document = {
  body: fakeEl(), createElement: () => fakeEl(), getElementById: () => null,
  querySelector: () => null, addEventListener() {},
};
const XHR2 = require('C:/Users/刘存安/.workbuddy/binaries/node/workspace/node_modules/xhr2/lib/xhr2.js');
globalThis.XMLHttpRequest = XHR2;
/* ---------------------------------------- */

const cloudbase = require('@cloudbase/js-sdk');

const ENV = 'jieyou-3gr01mvob9ad92de';
const SRC = 'stars';          // 星空树洞
const DST = 'life_stars';     // 生命万岁
const BACKUP_DIR = path.join(__dirname, 'star-migration-backup');
const ROOT = path.join(__dirname, '..');

async function readAll(db, name) {
  const out = [];
  const PAGE = 100;
  for (let skip = 0; skip < 100000; skip += PAGE) {
    const res = await db.collection(name).skip(skip).limit(PAGE).get();
    const rows = res.data || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function connect() {
  const app = cloudbase.init({ env: ENV });
  const auth = app.auth({ persistence: 'local' });
  const state = await auth.getLoginState();
  if (!state) await auth.signInAnonymously();
  return app.database();
}

const stripMeta = (r) => {
  const { _id, _openid, ...rest } = r;
  return rest;
};

const saveBackup = (name, rows) => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`  备份已写入: ${file}（${rows.length} 条）`);
};

(async () => {
  const action = process.argv[2] || 'plan';
  const db = await connect();
  console.log(`>> 已连接 TCB env=${ENV}`);

  if (action === 'backup') {
    const stars = await readAll(db, SRC);
    const life = await readAll(db, DST);
    saveBackup(SRC, stars);
    saveBackup(DST, life);
    return;
  }

  const stars = await readAll(db, SRC);
  const life = await readAll(db, DST);
  const active = stars.filter((s) => !(s.deleted_at || s.deletedAt));
  const existing = new Set(life.map((s) => s._id || s.id));
  const conflicts = active.filter((s) => existing.has(s._id || s.id));

  console.log(`>> stars 总数=${stars.length}，未删除=${active.length}`);
  console.log(`>> life_stars 现有=${life.length}`);
  console.log(`>> ID 冲突=${conflicts.length}${conflicts.length ? ' -> ' + JSON.stringify(conflicts.map((s) => s._id)) : ''}`);

  if (action === 'plan') {
    console.log('>> [plan] 以上为迁移计划，未做任何写入。');
    return;
  }

  if (action === 'migrate') {
    let ok = 0, fail = 0, regenerated = 0;
    for (const star of active) {
      const body = stripMeta(star); // 移除 _id/_openid —— TCB 不允许 set data 里带 _id
      let id = star._id || star.id;
      let finalId = id;
      try {
        if (existing.has(id)) {
          finalId = crypto.randomUUID().replace(/-/g, '');
          regenerated++;
          console.log(`   [冲突] ${id} -> 新 id ${finalId}`);
        }
        const col = db.collection(DST);
        let wrote = false;
        // 优先 doc(id).set() 保留原 id；SDK 权限/参数错误不抛异常而是返回 {code}
        const res = await col.doc(finalId).set(body);
        if (res && res.code && res.code !== 'OK') {
          throw new Error(`set 返回 ${res.code}: ${res.message}`);
        }
        wrote = true;
        existing.add(finalId);
        ok++;
        if (ok % 10 === 0) console.log(`   已写入 ${ok}/${active.length}...`);
      } catch (e) {
        fail++;
        console.error(`   [失败] ${id}: ${(e && e.message) || e}`);
      }
    }
    console.log(`>> migrate 完成: 成功 ${ok}，失败 ${fail}，冲突重生成 ${regenerated}`);
    if (fail > 0) process.exitCode = 1;
    return;
  }

  if (action === 'verify') {
    const after = await readAll(db, DST);
    console.log(`>> 校验: life_stars 当前=${after.length}（期望 ${life.length + active.length}）`);
    const ids = new Set(after.map((s) => s._id || s.id));
    const missing = active.filter((s) => !ids.has(s._id || s.id));
    console.log(`>> 应迁移 ${active.length} 条，缺失 ${missing.length} 条`);
    if (missing.length) {
      console.log('>> 缺失样例:', JSON.stringify(missing.slice(0, 3).map((s) => s._id)));
    }
    return;
  }

  console.error('未知动作: ' + action);
  process.exitCode = 2;
})().catch((e) => {
  console.error('MIGRATE_FAILED:', e && e.stack || e);
  process.exit(1);
});
