export const THEME_IDS = ['life'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export interface ThemeVisualConfig {
  accent: 'purple' | 'gold'
  defaultStarColor: string
  titleClass: string
  buttonGradientClass: string
  buttonHoverClass: string
  glowClass: string
  focusRingClass: string
  counterClass: string
  cardGlow: string
}

export interface ThemeConfig {
  id: ThemeId
  hub: {
    name: string
    eyebrow: string
    description: string
    invitation: string
  }
  welcome: {
    title: string
    intro: [string, string]
    countPrefix: string
    countNoun: string
    description: [string, string]
    features: [string, string, string]
    enterLabel: string
  }
  nickname: {
    placeholder: string
    submitLabel: string
    loadingLabel: string
    tip: string
  }
  sky: {
    title: string
    createLabel: string
    creatingLabel: string
    hint: string
    successNoun: string
    detailNoun: string
    modalPrompt: string
    modalPlaceholder: string
    modalConfirmLabel: string
    unavailableMessage: string
  }
  visual: ThemeVisualConfig
  audio: {
    background: string
    voices: string[]
  }
  data: {
    starsCollection: string
    quotaStorageKey: string
  }
}

const THEME_CONFIGS: Record<ThemeId, ThemeConfig> = {
  life: {
    id: 'life',
    hub: {
      name: '生命万岁企划',
      eyebrow: 'HAPPY MOMENTS',
      description: '愿我们，在看清了生活的真相之后，依然勇敢地选择热爱生活',
      invitation: '进入生命力星域',
    },
    welcome: {
      title: '生命万岁企划',
      intro: ['愿我们，在看清了生活的真相之后', '依然勇敢地选择热爱生活'],
      countPrefix: '欢迎生命力星域的',
      countNoun: '星星',
      description: ['爱自己', '是终身美丽的开始'],
      features: ['记录今天的小确幸', '在星空下许愿', '宇宙版烦恼树洞'],
      enterLabel: '进入幸福宇宙',
    },
    nickname: {
      placeholder: '留下你的别称（1-30个字符）',
      submitLabel: '点亮星星',
      loadingLabel: '正在进入幸福星空...',
      tip: '别称会陪伴你记录每一个幸福时刻',
    },
    sky: {
      title: '生命万岁企划',
      createLabel: '点亮星星',
      creatingLabel: '正在珍藏...',
      hint: '把值得幸福的事情，留在这片星空里 ☀',
      successNoun: '幸福星星',
      detailNoun: '生命力之星',
      modalPrompt: '生命里有哪些让你感到幸福的事？',
      modalPlaceholder: '写下这个值得庆祝、值得记住的瞬间（可选）',
      modalConfirmLabel: '幸福记录',
      unavailableMessage: '幸福星空暂时无法抵达',
    },
    visual: {
      accent: 'gold',
      defaultStarColor: '#FFC857',
      titleClass: 'bg-gradient-to-r from-amber-200 via-yellow-300 to-orange-400 bg-clip-text text-transparent',
      buttonGradientClass: 'from-amber-400 via-orange-500 to-rose-500',
      buttonHoverClass: 'hover:from-amber-300 hover:via-orange-400 hover:to-rose-400',
      glowClass: 'hover:shadow-orange-400/30',
      focusRingClass: 'focus:ring-amber-500 focus:border-amber-500 hover:border-amber-400',
      counterClass: 'text-amber-300',
      cardGlow: 'rgba(251, 146, 60, 0.4)',
    },
    audio: {
      background: '你终将会找到属于自己的月亮.mp3',
      voices: [
        '你本就是万千色彩.mp3',
        '愿你开心每一天.mp3',
        '愿世界待你以温柔.mp3',
        '祝你有美好的一天.mp3',
      ],
    },
    data: {
      starsCollection: 'life_stars',
      quotaStorageKey: 'device_daily_quota:life',
    },
  },
}

export const getThemeConfig = (id: ThemeId): ThemeConfig => THEME_CONFIGS[id]

export const tryGetThemeConfig = (id: string | null): ThemeConfig | null =>
  id && id in THEME_CONFIGS ? THEME_CONFIGS[id as ThemeId] : null

export const getThemeStarApiPath = (id: ThemeId, starId?: string): string => {
  const root = `/themes/${id}/stars`
  return starId ? `${root}/${encodeURIComponent(starId)}` : root
}

export const getThemeHealthApiPath = (id: ThemeId): string => `/themes/${id}/health`

export const getThemeTodayCountApiPath = (id: ThemeId): string => `/themes/${id}/stats/today`
