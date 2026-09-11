import { useState } from 'react';
import { createAccountInvitation, revokeAccountInvitation, mapRoadshowSyncError, type Credentials } from './songRequestCloud';

export default function AccountInvitations({ credentials }: { credentials: Credentials }) {
  const [alias, setAlias] = useState('');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const field = 'h-11 rounded-xl border border-white/15 bg-black/35 px-3 text-sm outline-none focus:border-orange-300/50';
  const run = async (revoke: boolean) => {
    setBusy(true); setMessage('');
    try {
      if (revoke) {
        await revokeAccountInvitation(credentials, code.trim());
        setCode(''); setExpiresAt(''); setMessage('邀请码已撤销。');
      } else {
        const result = await createAccountInvitation(credentials, alias.trim());
        setCode(result.code); setExpiresAt(result.expiresAt);
        setMessage('已生成，请复制并发给对方。每个码仅可开通一个账号。');
      }
    } catch (error) { setMessage(mapRoadshowSyncError(error)); }
    finally { setBusy(false); }
  };
  return <details className="mb-5 rounded-2xl border border-orange-200/15 bg-[#120b08]/85 p-5">
    <summary className="cursor-pointer font-bold text-orange-200">账号授权 · 站主专属</summary>
    <p className="my-3 text-sm text-white/50">邀请码 7 天有效，用后失效。可绑定对方账号；留空则不限制账号。</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="邀请码绑定账号" disabled={busy} className={`${field} min-w-0 flex-1`} value={alias} onChange={e => setAlias(e.target.value)} maxLength={30} placeholder="绑定账号（可选）" />
      <button disabled={busy} onClick={() => void run(false)} className="rounded-xl bg-orange-300 px-4 py-2 text-sm font-bold text-black disabled:opacity-50">生成邀请码</button>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label="邀请码" className={`${field} min-w-0 flex-1 font-mono`} disabled={busy} value={code} onChange={e => { setCode(e.target.value); setExpiresAt(''); }} maxLength={32} placeholder="新生成的邀请码，或粘贴旧码撤销" />
      <button disabled={busy || !code.trim()} className="rounded-xl border border-white/15 px-4 text-sm disabled:opacity-40" onClick={() => {
        if (!navigator.clipboard) { setMessage('请手动选中邀请码复制。'); return; }
        void navigator.clipboard.writeText(code).then(() => setMessage('已复制邀请码。')).catch(() => setMessage('复制失败，请手动选中邀请码复制。'));
      }}>复制</button>
      <button disabled={busy || !code.trim()} onClick={() => void run(true)} className="rounded-xl border border-white/15 px-4 text-sm disabled:opacity-40">撤销此码</button>
    </div>
    {expiresAt && <p className="mt-2 text-xs text-white/45">有效期至 {new Date(expiresAt).toLocaleString('zh-CN')}</p>}
    {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
  </details>;
}
