import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ListeningGameRoom } from './listeningGame';

const petPortrait = './dsh-pet-7340/pic/memes/main/可爱.png';
const lines = {
  waiting: ['好歌快开始啦！', '嗨，待会儿一起猜歌吧！', '先歇一歇，好歌马上来。'],
  listening: ['听旋律，可以先选歌。', '听到熟悉的旋律了吗？', '拿不准也没关系，现在还可以换。'],
  open: ['可以提交答案啦！', '选好那首歌，就可以提交啦！', '每轮只能提交一次哦。'],
  submitted: ['收到答案啦，等下一首吧。', '下一首我们继续听！', '和我一起等下一轮吧。'],
  revealed: ['这一轮结束啦。', '下一首再一起猜！', '你猜到刚才那首了吗？'],
  ended: ['谢谢你来听歌！', '下次路演见！', '挥挥手，下场再一起猜歌。'],
};

export default function ListeningGameGuestPet({ room }: { room: ListeningGameRoom | null }) {
  const [taps, setTaps] = useState(0);
  const portraitRef = useRef<HTMLImageElement>(null);
  const phase = room?.phase ?? 'waiting';
  const messages = room?.submission && (phase === 'open' || phase === 'listening') ? lines.submitted : lines[phase];
  const message = messages[taps ? 1 + (taps - 1) % (messages.length - 1) : 0];

  function greet() {
    setTaps(count => count + 1);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    portraitRef.current?.animate?.(
      [{ transform: 'scale(.84) rotate(-7deg)' }, { transform: 'scale(1.08) rotate(4deg)' }, { transform: 'none' }],
      { duration: 340, easing: 'ease-out' },
    );
  }

  return (
    <button
      type="button"
      aria-label="和鲸鱼娘互动"
      onClick={greet}
      className="group mb-3 flex w-full items-center gap-2.5 rounded-xl border border-orange-200/15 bg-orange-200/[.055] px-2.5 py-1 text-left transition-colors hover:border-orange-200/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200 sm:mb-4 sm:px-3"
    >
      <img
        ref={portraitRef}
        src={petPortrait}
        alt=""
        width={44}
        height={44}
        className="h-11 w-11 shrink-0 rounded-full object-contain motion-safe:transition-transform motion-safe:group-active:scale-90"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-orange-100">鲸鱼娘 <span className="ml-1 font-normal text-orange-100/55">点我互动</span></span>
        <span role="status" className="mt-0.5 block text-xs leading-4 text-white/65">{message}</span>
      </span>
      <Sparkles aria-hidden="true" className="mr-1 h-4 w-4 shrink-0 text-orange-200/50" />
    </button>
  );
}
