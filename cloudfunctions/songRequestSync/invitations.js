const crypto = require('node:crypto');
const invitationId = (code) => `invite-${crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')}`;
const read = async (ref) => {
  try {
    const result = await ref.get();
    return Array.isArray(result.data) ? result.data[0] : result.data;
  } catch (error) {
    if (/not found|does not exist/i.test(String(error?.message))) return null;
    throw error;
  }
};

// Keep invitations in the existing server-only collection; IDs cannot collide with account hashes.
const registerWithInvitation = (db, id, account, code, now) => db.runTransaction(async (tx) => {
  const accountRef = tx.collection('song_request_workspaces').doc(id);
  if (await read(accountRef)) throw new Error('ALREADY_REGISTERED');
  const inviteRef = tx.collection('song_request_workspaces').doc(invitationId(code));
  const invite = await read(inviteRef);
  if (!invite || invite.kind !== 'invitation' || invite.usedAt || invite.revokedAt
    || !(Date.parse(invite.expiresAt) > Date.parse(now))
    || (invite.boundAlias && invite.boundAlias !== account.alias.trim().toLowerCase())) throw new Error('INVALID_INVITATION');
  const { _id, ...data } = invite;
  await inviteRef.set({ ...data, usedAt: now, usedBy: id });
  await accountRef.set(account);
});

const revokeInvitation = (db, code, now) => db.runTransaction(async (tx) => {
  const ref = tx.collection('song_request_workspaces').doc(invitationId(code));
  const invite = await read(ref);
  if (!invite || invite.kind !== 'invitation') throw new Error('INVALID_INVITATION');
  const { _id, ...data } = invite;
  await ref.set({ ...data, revokedAt: now });
});
module.exports = { invitationId, registerWithInvitation, revokeInvitation };
