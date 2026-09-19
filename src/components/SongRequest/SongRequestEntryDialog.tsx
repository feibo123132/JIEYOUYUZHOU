import { useState } from 'react';
import { Eye, Lock, UserRound, X } from 'lucide-react';
import {
  mapRoadshowSyncError,
  pullRoadshows,
  registerRoadshowWorkspace,
  type Credentials,
} from './songRequestCloud';
import { saveBrowserSongRecordSession, SONG_REQUEST_SESSION_EVENT } from './songRecords';

interface SongRequestEntryDialogProps {
  defaultAlias?: string;
  onAuthenticated: (credentials: Credentials) => void;
  onGuest: () => void;
  onClose: () => void;
}

const SongRequestEntryDialog = ({
  defaultAlias = '',
  onAuthenticated,
  onGuest,
  onClose,
}: SongRequestEntryDialogProps) => {
  const [alias, setAlias] = useState(defaultAlias);
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const authenticate = async (authMode: 'login' | 'register') => {
    const next = { alias: alias.trim(), password };
    if (!next.alias || next.password.length < 6) {
      setMessage('请输入别称和至少 6 位管理口令。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      if (authMode === 'register') await registerRoadshowWorkspace(next, invitationCode);
      else await pullRoadshows(next);
      saveBrowserSongRecordSession(next);
      window.dispatchEvent(new Event(SONG_REQUEST_SESSION_EVENT));
      onAuthenticated(next);
    } catch (error) {
      setMessage(mapRoadshowSyncError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 px-4 py-8 text-white backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="song-request-entry-title">
      <section className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-orange-200/20 bg-[#120b08]/95 p-6 shadow-[0_32px_120px_rgba(0,0,0,.55)] sm:p-9">
        <span className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-orange-500/15 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-28 left-10 h-56 w-56 rounded-full bg-red-400/10 blur-3xl" />
        <button type="button" onClick={onClose} aria-label="关闭点歌台登录" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/55 transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>

        <div className="relative">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-orange-200/20 bg-orange-300/10 text-orange-200"><Lock className="h-6 w-6" /></div>
          <h2 id="song-request-entry-title" className="mt-5 font-serif text-3xl font-black">点歌台</h2>
          <p className="mt-2 text-sm leading-7 text-white/45">用户登录后进入私人点歌台，也可以用游客身份浏览公开吉他谱等。</p>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/30 p-1">
            <button type="button" onClick={() => setMessage('')} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-300 text-sm font-black text-black transition">
              <UserRound className="h-4 w-4" />用户登录
            </button>
            <button type="button" onClick={onGuest} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black text-white/55 transition hover:bg-white/5 hover:text-white/85">
              <Eye className="h-4 w-4" />游客浏览
            </button>
          </div>

          <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void authenticate('login'); }}>
            <div className="space-y-3">
              <input name="username" autoComplete="username" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="你的别称" maxLength={30} className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
              <input name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="管理口令（至少 6 位）" type="password" maxLength={64} className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 outline-none focus:border-orange-300/45" />
              <input aria-label="首次启用邀请码" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} placeholder="站主提供的邀请码（仅首次启用需要）" maxLength={32} autoComplete="off" className="h-12 w-full rounded-xl border border-white/10 bg-black/35 px-4 text-sm outline-none focus:border-orange-300/45" />
            </div>
            <p className="mt-2 text-xs text-white/45">新账号须先向站主申请邀请码；已有账号直接进入。</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="submit" disabled={busy} className="h-12 rounded-xl bg-orange-400 font-black text-black transition hover:bg-orange-300 disabled:opacity-50">进入我的点歌台</button>
              <button type="button" disabled={busy} onClick={() => void authenticate('register')} className="h-12 rounded-xl border border-white/15 bg-white/5 font-bold text-white/75 transition hover:bg-white/10 disabled:opacity-50">首次启用</button>
            </div>
          </form>

          {message && <p className="mt-4 text-sm text-amber-200/80" role="status">{message}</p>}
        </div>
      </section>
    </div>
  );
};

export default SongRequestEntryDialog;
