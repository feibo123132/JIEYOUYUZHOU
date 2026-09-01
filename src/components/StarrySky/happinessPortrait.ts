export interface HappinessStarInput {
  id: string;
  nickname: string;
  message?: string;
  createdAt: string;
}

export interface HappinessRepresentative {
  id: string;
  nickname: string;
  message: string;
  createdAt: string;
}

export interface HappinessKeywordResult {
  label: string;
  count: number;
  starIds: string[];
  representatives: HappinessRepresentative[];
}

export interface HappinessPortraitAnalysis {
  messageCount: number;
  keywords: HappinessKeywordResult[];
}

export const HAPPINESS_KEYWORDS = [
  { label: '陪伴', aliases: ['陪伴', '陪着', '一起', '相伴', '拥抱', '接住'] },
  { label: '家人', aliases: ['家人', '爸爸', '妈妈', '父母', '爷爷', '奶奶', '外公', '外婆', '家里', '回家'] },
  { label: '朋友', aliases: ['朋友', '友情', '同学', '伙伴', '闺蜜', '兄弟'] },
  { label: '宠物', aliases: ['宠物', '小猫', '猫咪', '小狗', '狗狗', '毛孩子'] },
  { label: '美食', aliases: ['早餐', '面', '饭', '菜', '水果', '糖果', '甜品', '咖啡', '热茶', '奶茶', '好吃'] },
  { label: '音乐', aliases: ['音乐', '歌曲', '唱歌', '耳机', '演出', '琴'] },
  { label: '自然', aliases: ['阳光', '晚霞', '天空', '花草', '泥土', '风', '雨', '月光', '云朵', '星星'] },
  { label: '休息', aliases: ['休息', '睡觉', '自然醒', '被窝', '放松', '躺下', '松口气', '发呆'] },
  { label: '成长', aliases: ['完成', '坚持', '学会', '进步', '勇敢', '努力', '做到了', '成长'] },
  { label: '被惦记', aliases: ['惦念', '想念', '回复', '问候', '关心', '收到消息', '记得我'] },
  { label: '仪式感', aliases: ['纪念', '庆祝', '礼物', '生日', '节日', '记录', '收藏', '仪式'] },
  { label: '自由', aliases: ['自由', '自在', '随心', '散步', '出发', '旅行', '独处'] },
] as const;

export const normalizeHappinessText = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[\p{P}\p{S}\s]+/gu, '');

const representativeTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
};

export const analyzeHappinessPortrait = (
  stars: readonly HappinessStarInput[],
): HappinessPortraitAnalysis => {
  const messageStars = stars.flatMap((item) => {
    const message = item.message?.trim();
    return message ? [{ ...item, message, normalizedMessage: normalizeHappinessText(message) }] : [];
  });

  const keywords = HAPPINESS_KEYWORDS.flatMap((definition, dictionaryIndex) => {
    const normalizedAliases = definition.aliases.map(normalizeHappinessText);
    const matches = messageStars.filter(({ normalizedMessage }) => (
      normalizedAliases.some((alias) => normalizedMessage.includes(alias))
    ));
    if (matches.length === 0) return [];

    const representatives = matches
      .map(({ id, nickname, message, createdAt }) => ({ id, nickname, message, createdAt }))
      .sort((first, second) => {
        const timeDifference = representativeTime(second.createdAt) - representativeTime(first.createdAt);
        return timeDifference || first.id.localeCompare(second.id);
      })
      .slice(0, 3);

    return [{
      label: definition.label,
      count: matches.length,
      starIds: matches.map(({ id }) => id),
      representatives,
      dictionaryIndex,
    }];
  })
    .sort((first, second) => second.count - first.count || first.dictionaryIndex - second.dictionaryIndex)
    .slice(0, 12)
    .map(({ dictionaryIndex: _dictionaryIndex, ...keyword }) => keyword);

  return { messageCount: messageStars.length, keywords };
};

export const resolveSelectedHappinessKeyword = (
  current: string | null,
  keywords: readonly Pick<HappinessKeywordResult, 'label'>[],
) => {
  if (current && keywords.some(({ label }) => label === current)) return current;
  return keywords[0]?.label ?? null;
};

export const isHappinessPortraitCloseKey = (key: string) => key === 'Escape';

export const restoreHappinessPortraitFocus = (target: { focus: () => void } | null) => {
  target?.focus();
};
