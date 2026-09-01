import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { Quote, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  analyzeHappinessPortrait,
  isHappinessPortraitCloseKey,
  type HappinessStarInput,
} from './happinessPortrait';
import { getHappinessNodeVisual } from './happinessSkyLayout';

interface HappinessSkyPageProps {
  stars: HappinessStarInput[];
  onBack: () => void;
}

type HappinessNodeStyle = CSSProperties & {
  '--happiness-node-x': string;
  '--happiness-node-y': string;
  '--happiness-node-diameter': string;
  '--happiness-node-font-size': string;
  '--happiness-node-depth': string;
  '--happiness-node-color': string;
  '--happiness-node-strength': number;
  '--happiness-node-delay': string;
};

type HappinessStageStyle = CSSProperties & {
  '--happiness-tilt-x': string;
  '--happiness-tilt-y': string;
};

const nodeColors = [
  '#ffe49a', '#ffd166', '#ffbb55', '#fff0bd', '#ff9f5a', '#ff8398',
  '#f7c65d', '#f4a261', '#fff5d8', '#ffb36b', '#ffdca8', '#ff9676',
] as const;

const HappinessSkyPage = ({ stars, onBack }: HappinessSkyPageProps) => {
  const analysis = useMemo(() => analyzeHappinessPortrait(stars), [stars]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setSelectedLabel((current) => current && analysis.keywords.some(({ label }) => label === current) ? current : null);
  }, [analysis.keywords]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isHappinessPortraitCloseKey(event.key)) return;
      event.preventDefault();
      onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -7;
    setTilt({ x, y });
  };

  const selectedKeyword = analysis.keywords.find(({ label }) => label === selectedLabel) ?? null;
  const counts = analysis.keywords.map(({ count }) => count);
  const minimumCount = counts.length ? Math.min(...counts) : 0;
  const maximumCount = counts.length ? Math.max(...counts) : 0;
  const stageStyle: HappinessStageStyle = {
    '--happiness-tilt-x': `${tilt.y}deg`,
    '--happiness-tilt-y': `${tilt.x}deg`,
  };

  return (
    <main className="happiness-sky-page" aria-labelledby="happiness-sky-title">
      <div className="happiness-sky-aurora" aria-hidden="true" />
      <button type="button" autoFocus onClick={onBack} className="happiness-sky-back">
        <RotateCcw className="h-4 w-4" />
        <span>返回</span>
      </button>

      <header className="happiness-sky-header">
        <div className="happiness-sky-title-row">
          <Sparkles data-happiness-title-star aria-hidden="true" />
          <h1 id="happiness-sky-title">幸福的模样</h1>
          <Sparkles data-happiness-title-star aria-hidden="true" />
        </div>
      </header>

      {analysis.messageCount === 0 ? (
        <div className="happiness-sky-empty"><span aria-hidden="true">✦</span>这片星空正在慢慢长出幸福的模样</div>
      ) : analysis.keywords.length === 0 ? (
        <div className="happiness-sky-empty"><span aria-hidden="true">◌</span>幸福还没有名字，但它已经在这里发生</div>
      ) : (
        <div className="happiness-sky-field" onPointerMove={handlePointerMove} onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
          <div className="happiness-sky-stage" style={stageStyle} aria-label="幸福关键词星空">
            <div className="happiness-sky-orbit happiness-sky-orbit--inner" aria-hidden="true" />
            <div className="happiness-sky-orbit happiness-sky-orbit--outer" aria-hidden="true" />
            {analysis.keywords.map((keyword, index) => {
              const visual = getHappinessNodeVisual(keyword.count, minimumCount, maximumCount, index);
              const selected = keyword.label === selectedLabel;
              const style: HappinessNodeStyle = {
                '--happiness-node-x': `${visual.x}%`,
                '--happiness-node-y': `${visual.y}%`,
                '--happiness-node-diameter': `${visual.diameter}px`,
                '--happiness-node-font-size': `${visual.fontSize}px`,
                '--happiness-node-depth': `${visual.depth}px`,
                '--happiness-node-color': nodeColors[index],
                '--happiness-node-strength': visual.ratio,
                '--happiness-node-delay': `${index * 75}ms`,
              };
              return (
                <button
                  key={keyword.label}
                  type="button"
                  className={`happiness-sky-node ${selected ? 'is-selected' : ''}`}
                  style={style}
                  aria-pressed={selected}
                  onClick={() => {
                    (window as any).playClickSound?.();
                    setSelectedLabel((current) => current === keyword.label ? null : keyword.label);
                  }}
                >
                  <span>{keyword.label}</span>
                  <small>{keyword.count}</small>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="happiness-sky-summary">
        从 {analysis.messageCount} 颗星星里，看见 {analysis.keywords.length} 种幸福
      </div>

      {selectedKeyword && (
        <aside className="happiness-sky-stories" aria-live="polite" aria-label={`关于${selectedKeyword.label}的幸福留言`}>
          <button type="button" className="happiness-sky-stories-close" onClick={() => setSelectedLabel(null)} aria-label="收起留言">
            <X className="h-4 w-4" />
          </button>
          <div className="happiness-sky-stories-kicker">在 {selectedKeyword.count} 颗星星里闪烁</div>
          <h2>关于「{selectedKeyword.label}」</h2>
          <div className="happiness-sky-story-list">
            {selectedKeyword.representatives.slice(0, 3).map((representative) => (
              <article key={representative.id} className="happiness-sky-story">
                <Quote className="h-4 w-4" aria-hidden="true" />
                <p>{representative.message}</p>
                <footer>— {representative.nickname}</footer>
              </article>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
};

export default HappinessSkyPage;
