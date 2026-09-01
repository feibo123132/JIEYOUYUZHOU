import type { Song } from './songCatalog';

export interface SongScore {
  id: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  pages: string[];
  updatedAt: string;
}

export const SCORES_CACHE_PREFIX = 'jieyou-song-scores-v1:';
export const SCORE_PAGE_LIMIT = 4;
export const SCORE_PAGES_TOTAL_LIMIT = 4_600_000;
export const SCORE_PAGE_CACHE_PREFIX = 'jieyou-song-score-page-v1:';

interface ReadableStorage { getItem: (key: string) => string | null; }
interface WritableStorage { setItem: (key: string, value: string) => void; }

const isScorePage = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && (
    (/^https:\/\/\S+$/i.test(value) && value.length <= 600)
    || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
);

export const isValidSongScore = (value: unknown): value is SongScore => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const score = value as Partial<SongScore>;
  return typeof score.id === 'string' && score.id.length > 0 && score.id.length <= 120
    && typeof score.songId === 'string' && score.songId.length > 0 && score.songId.length <= 100
    && typeof score.songTitle === 'string' && score.songTitle.length <= 100
    && (score.songArtist === undefined || (typeof score.songArtist === 'string' && score.songArtist.length <= 100))
    && Array.isArray(score.pages) && score.pages.length >= 1 && score.pages.length <= SCORE_PAGE_LIMIT
    && score.pages.every(isScorePage)
    && score.pages.join('').length <= SCORE_PAGES_TOTAL_LIMIT;
};

export const parseSongScores = (value: unknown): SongScore[] => (
  Array.isArray(value) ? value.filter(isValidSongScore) : []
);

export const buildSongScore = (song: Song, pages: string[]): SongScore => ({
  id: `score-${song.id}`,
  songId: song.id,
  songTitle: song.title,
  songArtist: song.artist,
  pages,
  updatedAt: new Date().toISOString(),
});

export const loadSongScoreCache = (storage: ReadableStorage, alias: string | null): SongScore[] => {
  if (!alias) return [];
  try {
    return parseSongScores(JSON.parse(storage.getItem(`${SCORES_CACHE_PREFIX}${alias}`) ?? '[]'));
  } catch {
    return [];
  }
};

export const saveSongScoreCache = (storage: WritableStorage, alias: string, scores: SongScore[]) => {
  try {
    storage.setItem(`${SCORES_CACHE_PREFIX}${alias}`, JSON.stringify(scores));
  } catch {
    // 本地缓存写满时静默失败，云端仍是权威数据。
  }
};

export const readScorePage = (storage: ReadableStorage, songId: string): number => {
  const raw = Number(storage.getItem(`${SCORE_PAGE_CACHE_PREFIX}${songId}`));
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
};

export const saveScorePage = (storage: WritableStorage, songId: string, page: number) => {
  try {
    storage.setItem(`${SCORE_PAGE_CACHE_PREFIX}${songId}`, String(page));
  } catch {
    // 页码记忆只是便利功能，失败可忽略。
  }
};

// 长图谱子（多页拼合）按宽度基准缩放：宽度达标即可保证文字清晰，纵向高度不设上限。
const SCORE_IMAGE_MAX_WIDTH = 2000;
// 单页 base64 目标长度；超限则逐级降质量/宽度，尽量保住清晰度。
const SCORE_IMAGE_TARGET_CHARS = 4_400_000;
const SCORE_IMAGE_HARD_CHARS = 4_550_000;

export const compressScoreImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) {
    reject(new Error('仅支持图片文件'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('图片读取失败'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('图片解析失败'));
    image.onload = () => {
      const render = (maxWidth: number, quality: number): string => {
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return '';
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', quality);
      };
      const attempts: Array<[number, number]> = [
        [SCORE_IMAGE_MAX_WIDTH, 0.9],
        [SCORE_IMAGE_MAX_WIDTH, 0.85],
        [Math.round(SCORE_IMAGE_MAX_WIDTH * 0.85), 0.85],
        [Math.round(SCORE_IMAGE_MAX_WIDTH * 0.7), 0.8],
      ];
      let result = '';
      for (const [maxWidth, quality] of attempts) {
        result = render(maxWidth, quality);
        if (!result) {
          reject(new Error('图片处理失败'));
          return;
        }
        if (result.length <= SCORE_IMAGE_TARGET_CHARS) break;
      }
      if (result.length > SCORE_IMAGE_HARD_CHARS) {
        reject(new Error('这张谱子图片太大了，请裁剪或分段后再上传'));
        return;
      }
      resolve(result);
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});
