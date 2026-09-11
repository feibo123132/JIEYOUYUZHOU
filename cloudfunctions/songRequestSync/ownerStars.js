const crypto = require('node:crypto');
const read = async ref => {
  try { const result = await ref.get(); return Array.isArray(result.data) ? result.data[0] : result.data; }
  catch (error) { if (/not found|does not exist/i.test(String(error?.message))) return null; throw error; }
};
const reserved = name => typeof name === 'string' && name.trim().toUpperCase() === 'JIEYOU';
const fields = payload => {
  if (!payload || typeof payload !== 'object') throw new Error('INVALID_STAR');
  const value = {};
  for (const key of ['message', 'color', 'shape']) if (payload[key] !== undefined) {
    if (typeof payload[key] !== 'string' || payload[key].length > (key === 'message' ? 4000 : 80)) throw new Error('INVALID_STAR');
    value[key] = payload[key];
  }
  for (const key of ['position_x', 'position_y', 'size']) if (payload[key] !== undefined) {
    if (!Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 100) throw new Error('INVALID_STAR');
    value[key] = payload[key];
  }
  return value;
};
async function ownerStars(db, request) {
  if (request.themeId !== 'life') throw new Error('INVALID_STAR');
  const collection = db.collection('song_request_workspaces');
  if (request.action === 'stars:ownerPull') {
    // Move historical reserved-name stars atomically before returning the private view.
    const legacy = [];
    for (let offset = 0; ; offset += 100) {
      const page = (await db.collection('life_stars').skip(offset).limit(100).get()).data || [];
      legacy.push(...page.filter(star => reserved(star.nickname)));
      if (page.length < 100) break;
    }
    for (const old of legacy) await db.runTransaction(async tx => {
      const from = tx.collection('life_stars').doc(old._id);
      const star = await read(from);
      if (!star || !reserved(star.nickname)) return;
      const id = `owner-star-${crypto.createHash('sha256').update(old._id).digest('hex')}`;
      const to = tx.collection('song_request_workspaces').doc(id);
      if (!await read(to)) {
        const { _id, _openid, ...data } = star;
        await to.set({ kind: 'ownerStar', themeId: 'life', star: { ...data, id, nickname: 'JIEYOU', user_id: 'jieyou-owner' } });
      }
      await from.remove();
    });
    const stars = [];
    for (let offset = 0; ; offset += 100) {
      const page = (await collection.where({ kind: 'ownerStar', themeId: 'life' }).skip(offset).limit(100).get()).data || [];
      stars.push(...page.map(item => item.star));
      if (page.length < 100) break;
    }
    return { stars };
  }
  if (request.action === 'stars:ownerCreate') {
    const value = fields(request.star);
    if (value.position_x === undefined || value.position_y === undefined) throw new Error('INVALID_STAR');
    const id = `owner-star-${crypto.randomUUID()}`;
    const star = { ...value, id, nickname: 'JIEYOU', user_id: 'jieyou-owner', created_at: new Date().toISOString() };
    await collection.doc(id).set({ kind: 'ownerStar', themeId: 'life', star });
    return { star };
  }
  if (typeof request.id !== 'string' || !/^owner-star-[a-f0-9-]{36,64}$/.test(request.id)) throw new Error('INVALID_STAR');
  return db.runTransaction(async tx => {
    const ref = tx.collection('song_request_workspaces').doc(request.id);
    const record = await read(ref);
    if (!record || record.kind !== 'ownerStar') throw new Error('NOT_FOUND');
    const { _id, ...clean } = record;
    if (request.action === 'stars:ownerPurge') { await ref.remove(); return {}; }
    const star = { ...record.star };
    if (request.action === 'stars:ownerDelete') star.deleted_at = Date.now();
    if (request.action === 'stars:ownerRestore') { delete star.deleted_at; delete star.deletedAt; }
    if (request.action === 'stars:ownerUpdate') {
      if (star.deleted_at || star.deletedAt) throw new Error('NOT_FOUND');
      Object.assign(star, fields(request.star));
    }
    await ref.set({ ...clean, star });
    return { star };
  });
}
module.exports = { ownerStars, reserved };
