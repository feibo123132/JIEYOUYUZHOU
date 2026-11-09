import { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, X } from 'lucide-react';
import { getAudioContext } from './audioClipping';

const mediaFolder = './listening-game/feedback/';
const content = {
  correct: {
    title: '答对了！', description: '这段旋律，被你认出来了。', fallback: '好耳力！', Icon: Check,
    background: 'bg-[#e3edce]', iconStyle: 'border-[#638346]/25 bg-[#638346]/10 text-[#638346]',
  },
  incorrect: {
    title: '答错了', description: '差一点，下一首继续加油。', fallback: '下首再战！', Icon: X,
    background: 'bg-[#f3e0c8]', iconStyle: 'border-[#bb7e47]/25 bg-[#bb7e47]/10 text-[#bb7e47]',
  },
  confirm: {
    title: '你确定吗？', description: '每轮只能提交一次，确认后不能修改。', fallback: '再确认一下', Icon: CircleHelp,
    background: 'bg-[#f4e8c9]', iconStyle: 'border-[#9d7837]/25 bg-[#9d7837]/10 text-[#9d7837]',
  },
};

type FeedbackProps = { songTitle: string; onClose: () => void } & (
  { kind: 'correct' | 'incorrect' } | { kind: 'confirm'; onConfirm: () => void }
);

const primaryButton = 'min-h-11 rounded-xl bg-[#e9c75b] px-4 py-3 text-sm font-black text-[#3e3c26] transition hover:bg-[#e3bc40] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8e7834]';

export function unlockListeningGameFeedbackAudio() {
  try {
    const audio = getAudioContext();
    if (audio.state !== 'running') void audio.resume().catch(() => {});
  } catch {
    // The popup remains usable when audio is unavailable.
  }
}

export default function ListeningGameFeedbackDialog(props: FeedbackProps) {
  const { kind, songTitle, onClose } = props;
  const { title, description, fallback, Icon, background, iconStyle } = content[kind];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let playing: AudioBufferSourceNode | undefined;
    async function playFeedback() {
      try {
        const audio = getAudioContext();
        const variant = kind === 'confirm' ? '' : `-${1 + Math.floor(Math.random() * 3)}`;
        const response = await fetch(`${mediaFolder}${kind}${variant}.mp3`, { signal: controller.signal });
        if (!response.ok) return;
        const clip = await audio.decodeAudioData(await response.arrayBuffer());
        if (controller.signal.aborted || audio.state !== 'running') return;
        const source = audio.createBufferSource();
        source.buffer = clip;
        source.connect(audio.destination);
        source.start();
        playing = source;
      } catch {
        // Missing or unsupported audio never blocks submission.
      }
    }
    void playFeedback();
    return () => {
      controller.abort();
      playing?.stop();
      playing?.disconnect();
    };
  }, [kind]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="listening-game-feedback-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-[1.5rem] border-0 bg-[#fffcf2] p-5 text-[#354239] shadow-[0_24px_100px_rgba(0,0,0,.4)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl ${background}`}>
        {imageFailed ? (
          <div className="text-center">
            <span className={`mx-auto grid h-24 w-24 place-items-center rounded-full border-2 ${iconStyle}`}><Icon className="h-14 w-14" strokeWidth={2.5} /></span>
            <p className="mt-5 font-serif text-2xl font-black tracking-widest">{fallback}</p>
          </div>
        ) : <img src={`${mediaFolder}${kind}.png`} alt={title} onError={() => setImageFailed(true)} className="h-full w-full object-cover" />}
      </div>
      <div className="pb-1 pt-5 text-center">
        <h2 id="listening-game-feedback-title" className="text-2xl font-black">{title}</h2>
        <p className="mt-2 text-sm text-[#66715f]">{description}</p>
        <p className="mt-3 break-words text-sm leading-6">{kind === 'confirm' ? '你选的是' : '正确答案'}：<strong>{songTitle}</strong></p>
      </div>
      {kind === 'confirm' ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" autoFocus onClick={onClose} className="min-h-11 rounded-xl border border-[#d5c7a6] px-4 py-3 text-sm font-bold transition hover:bg-[#f4e8c9]">重新选择</button>
          <button type="button" data-custom-click-sound="" onClick={props.onConfirm} className={primaryButton}>确认提交</button>
        </div>
      ) : <button type="button" autoFocus onClick={onClose} className={`mt-4 w-full ${primaryButton}`}>知道了</button>}
    </dialog>
  );
}
