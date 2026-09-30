import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowLeft, Brush, Check, Eraser, Hand, Redo2, Type, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { compressScoreImage } from './songScores';

type Tool = 'hand' | 'pen' | 'cover' | 'text';
type Point = { x: number; y: number };
type Stroke = { kind: 'stroke'; color: string; width: number; points: Point[] };
type Label = { kind: 'text'; color: string; size: number; text: string; cover: boolean; point: Point };
type Mark = Stroke | Label;

const colors = ['#171717', '#df3746', '#1464d8', '#168451', '#ea8a15', '#ffffff'];
const MAX_EDITOR_PIXELS = 12_000_000;

const drawMark = (context: CanvasRenderingContext2D, mark: Mark) => {
  if (mark.kind === 'stroke') {
    const { points } = mark;
    if (!points.length) return;
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    context.lineWidth = mark.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, mark.width / 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
    return;
  }
  context.font = `700 ${mark.size}px system-ui, -apple-system, sans-serif`;
  context.textBaseline = 'top';
  if (mark.cover) {
    const padding = Math.max(4, mark.size * 0.15);
    context.fillStyle = '#ffffff';
    context.fillRect(mark.point.x - padding, mark.point.y - padding, context.measureText(mark.text).width + padding * 2, mark.size * 1.3 + padding * 2);
  }
  context.fillStyle = mark.color;
  context.fillText(mark.text, mark.point.x, mark.point.y);
};

interface ScorePageEditorProps {
  source: string;
  title: string;
  pageNumber: number;
  onSave: (page: string) => void;
  onClose: () => void;
}

export default function ScorePageEditor({ source, title, pageNumber, onSave, onClose }: ScorePageEditorProps) {
  const [tool, setTool] = useState<Tool>('hand');
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(8);
  const [fontSize, setFontSize] = useState(36);
  const [label, setLabel] = useState('');
  const [coverText, setCoverText] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [redoMarks, setRedoMarks] = useState<Mark[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const draftRef = useRef<Stroke | null>(null);
  const activePointerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    const load = async () => {
      try {
        const response = await fetch(source, { signal: controller.signal });
        if (!response.ok) throw new Error('FETCH_FAILED');
        const blob = await response.blob();
        if (!blob.size) throw new Error('INVALID_IMAGE');
        objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('IMAGE_FAILED'));
          image.src = objectUrl;
        });
        if (controller.signal.aborted) return;
        const scale = Math.min(1, 2000 / image.naturalWidth, Math.sqrt(MAX_EDITOR_PIXELS / (image.naturalWidth * image.naturalHeight)));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = baseRef.current;
        const overlay = overlayRef.current;
        if (!canvas || !overlay) return;
        canvas.width = overlay.width = width;
        canvas.height = overlay.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('CANVAS_FAILED');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        setSize({ width, height });
      } catch {
        if (!controller.signal.aborted) setError('谱页无法载入编辑器。请检查网络连接，或重新打开谱子后再试。');
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };
    void load();
    return () => controller.abort();
  }, [source]);

  const renderMarks = (items: Mark[], draft: Stroke | null = null) => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    items.forEach((item) => drawMark(context, item));
    if (draft) drawMark(context, draft);
  };

  useEffect(() => { renderMarks(marks); }, [marks, size]);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(size.width, (event.clientX - rect.left) * size.width / rect.width)),
      y: Math.max(0, Math.min(size.height, (event.clientY - rect.top) * size.height / rect.height)),
    };
  };

  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!size.width || saving) return;
    if (tool === 'text') {
      if (!label.trim()) { setError('请先输入文字，再点击谱页放置。'); return; }
      setMarks((items) => [...items, { kind: 'text', color, size: fontSize, text: label.trim(), cover: coverText, point: pointAt(event) }]);
      setRedoMarks([]);
      setError('');
      return;
    }
    if (tool !== 'pen' && tool !== 'cover') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    draftRef.current = { kind: 'stroke', color: tool === 'cover' ? '#ffffff' : color, width, points: [pointAt(event)] };
    renderMarks(marks, draftRef.current);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId || !draftRef.current) return;
    event.preventDefault();
    draftRef.current.points.push(pointAt(event));
    renderMarks(marks, draftRef.current);
  };

  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId || !draftRef.current) return;
    activePointerRef.current = null;
    const completed = draftRef.current;
    draftRef.current = null;
    setMarks((items) => [...items, completed]);
    setRedoMarks([]);
  };

  const close = () => {
    if (saving) return;
    if (marks.length && !window.confirm('放弃这页尚未保存的批注吗？')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const save = async () => {
    const base = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay || !marks.length || saving) return;
    setSaving(true);
    setError('');
    try {
      const merged = document.createElement('canvas');
      merged.width = base.width;
      merged.height = base.height;
      const context = merged.getContext('2d');
      if (!context) throw new Error('CANVAS_FAILED');
      context.drawImage(base, 0, 0);
      context.drawImage(overlay, 0, 0);
      let result = merged.toDataURL('image/jpeg', 0.88);
      if (result.length > 4_550_000) {
        const blob = await new Promise<Blob | null>((resolve) => merged.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob) throw new Error('ENCODE_FAILED');
        result = await compressScoreImage(new File([blob], 'edited-score.jpg', { type: 'image/jpeg' }));
      }
      onSave(result);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === 'SCORE_NOT_READY'
        ? '谱子正在同步，请稍等云端保存完成后重试。'
        : '保存失败：图片可能过大，请减少批注或把长图拆成多页。');
      setSaving(false);
    }
  };

  const toolButton = (value: Tool, icon: React.ReactNode, name: string) => (
    <button type="button" aria-pressed={tool === value} onClick={() => { setTool(value); setError(''); }}
      className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${tool === value ? 'bg-orange-300 text-black' : 'bg-white/10 text-white/75 hover:bg-white/20'}`}>
      {icon}{name}
    </button>
  );

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#15131a] text-white" role="dialog" aria-label={`${title} 第 ${pageNumber} 页谱子编辑器`}>
      <header className="shrink-0 border-b border-white/10 bg-[#15131a]/95 px-3 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={close} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white/75 hover:bg-white/10"><ArrowLeft className="h-4 w-4" />取消</button>
          <span className="mr-auto min-w-0 truncate text-xs font-bold text-white/55">{title} · 第 {pageNumber} 页</span>
          <button type="button" aria-label="撤销" disabled={!marks.length || saving} onClick={() => { const last = marks.at(-1); if (last) { setMarks(marks.slice(0, -1)); setRedoMarks((items) => [...items, last]); } }} className="grid h-10 w-10 place-items-center rounded-xl text-white/75 hover:bg-white/10 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" aria-label="重做" disabled={!redoMarks.length || saving} onClick={() => { const last = redoMarks.at(-1); if (last) { setRedoMarks(redoMarks.slice(0, -1)); setMarks((items) => [...items, last]); } }} className="grid h-10 w-10 place-items-center rounded-xl text-white/75 hover:bg-white/10 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          <button type="button" disabled={!marks.length || saving} onClick={() => void save()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-orange-300 px-4 text-xs font-black text-black hover:bg-orange-200 disabled:opacity-40"><Check className="h-4 w-4" />{saving ? '处理中…' : '保存'}</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {toolButton('hand', <Hand className="h-4 w-4" />, '移动')}
          {toolButton('pen', <Brush className="h-4 w-4" />, '画笔')}
          {toolButton('cover', <Eraser className="h-4 w-4" />, '白色遮盖')}
          {toolButton('text', <Type className="h-4 w-4" />, '文字')}
          <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
          {tool === 'pen' || tool === 'text' ? <div className="flex items-center gap-1" aria-label="批注颜色">{colors.map((value) => <button key={value} type="button" aria-label={`${value} 颜色`} aria-pressed={color === value} onClick={() => setColor(value)} className={`h-7 w-7 rounded-full border-2 ${color === value ? 'border-orange-300 ring-1 ring-orange-300/50' : 'border-white/40'}`} style={{ background: value }} />)}</div> : null}
          {tool === 'pen' || tool === 'cover' ? <label className="flex items-center gap-2 text-[11px] text-white/65">粗细 <input type="range" min="2" max="32" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-24 accent-orange-300" /><span className="w-5 tabular-nums">{width}</span></label> : null}
          {tool === 'text' ? <>
            <input type="text" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder="输入和弦或文字，再点谱页" aria-label="批注文字" className="h-9 min-w-40 flex-1 rounded-lg border border-white/20 bg-black/35 px-3 text-sm outline-none focus:border-orange-300" />
            <label className="flex items-center gap-1.5 text-[11px] text-white/65">字号 <input type="range" min="16" max="80" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} className="w-20 accent-orange-300" /><span className="w-5 tabular-nums">{fontSize}</span></label>
            <label className="flex items-center gap-1.5 text-[11px] text-white/65"><input type="checkbox" checked={coverText} onChange={(event) => setCoverText(event.target.checked)} className="accent-orange-300" />白底遮盖原和弦</label>
          </> : null}
          <div className="ml-auto flex items-center gap-1"><button type="button" aria-label="缩小编辑视图" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30"><ZoomOut className="h-4 w-4" /></button><span className="w-10 text-center text-[11px] tabular-nums text-white/55">{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大编辑视图" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30"><ZoomIn className="h-4 w-4" /></button></div>
        </div>
        <p className="mt-1 text-[11px] text-white/40">{tool === 'hand' ? '拖动浏览谱页；放大后可以精确定位。' : tool === 'text' ? '输入文字后点击谱页放置；撤销可移除上一处。' : '用手指或 Apple Pencil 在谱页上绘制；选“移动”可继续浏览。'}</p>
        {error && <p role="alert" className="mt-1 text-xs text-amber-200">{error}</p>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto bg-[#302c31] p-3 sm:p-5" style={{ overscrollBehavior: 'contain' }}>
        <div className="relative mx-auto bg-white shadow-2xl" style={{ width: `${zoom * 100}%`, maxWidth: 'none', aspectRatio: size.width && size.height ? `${size.width} / ${size.height}` : '3 / 4' }}>
          <canvas ref={baseRef} className="block h-auto w-full" aria-hidden="true" />
          <canvas ref={overlayRef} aria-label="谱页批注画布" className="absolute inset-0 h-full w-full" style={{ touchAction: tool === 'hand' ? 'auto' : 'none', pointerEvents: tool === 'hand' ? 'none' : 'auto', cursor: tool === 'text' ? 'text' : tool === 'hand' ? 'grab' : 'crosshair' }} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
          {!size.width && !error && <div className="absolute inset-0 grid place-items-center text-sm text-black/50">正在载入谱页…</div>}
        </div>
      </div>
    </div>
  );
}
