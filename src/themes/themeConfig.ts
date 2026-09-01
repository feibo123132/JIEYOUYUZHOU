export const THEME_IDS = ['jieyou', 'life'] as const

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
  jieyou: {
    id: 'jieyou',
    hub: {
      name: '星空树洞企划',
      eyebrow: 'GENTLE RELIEF',
      description: '在星空下许愿，把难以言说的心事交给宇宙。',
      invitation: '进入解忧星域',
    },
    welcome: {
      title: '星空树洞',
      intro: ['我们在此刻相遇，你抬起手', '在天空中点亮了一颗，独属于自己的星星'],
      countPrefix: '欢迎星空树洞的',
      countNoun: '星星',
      description: ['在天空中点亮一颗独属于你自己的星星', '让每一次相遇都成为永恒的纪念'],
      features: ['在星空下许愿', '宇宙版烦恼树洞', '分享生活小美满'],
      enterLabel: '遨游宇宙',
    },
    nickname: {
      placeholder: '请输入星星的别称（1-30个字符）',
      submitLabel: '点亮星星',
      loadingLabel: '正在进入宇宙...',
      tip: '别称将显示在你的星星旁边',
    },
    sky: {
      title: '星空树洞',
      createLabel: '点亮星星',
      creatingLabel: '正在点亮...',
      hint: '点击按钮，在星空中点亮属于你的星星 ✨',
      successNoun: '新星星',
      detailNoun: '星星',
      modalPrompt: '想对这片宇宙说些什么？',
      modalPlaceholder: '写下此刻的心情或愿望（可选）',
      modalConfirmLabel: '点亮',
      unavailableMessage: '星空树洞暂时无法抵达',
    },
    visual: {
      accent: 'purple',
      defaultStarColor: '#FFD700',
      titleClass: 'text-purple-500',
      buttonGradientClass: 'from-purple-600 via-purple-700 to-indigo-700',
      buttonHoverClass: 'hover:from-purple-500 hover:via-purple-600 hover:to-indigo-600',
      glowClass: 'hover:shadow-purple-500/25',
      focusRingClass: 'focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400',
      counterClass: 'text-purple-500',
      cardGlow: 'rgba(139, 92, 246, 0.42)',
    },
    audio: {
      background: '你终将会找到属于自己的月亮.mp3',
      voices: [
        '朝着自己的月亮走.mp3',
        '欢迎你到解忧宇宙遨游.mp3',
        '每当宇宙闪烁.mp3',
        '你本就是万千色彩.mp3',
        '你终将会找到属于自己的月亮②.mp3',
        '生活所有的无奈.mp3',
        '愿你开心每一天.mp3',
        '愿世界待你以温柔.mp3',
        '月亮终究会到来.mp3',
        '祝你有美好的一天.mp3',
      ],
    },
    data: {
      starsCollection: 'stars',
      quotaStorageKey: 'device_daily_quota:jieyou',
    },
  },
  life: {
    id: 'life',
    hub: {
      name: '生命万岁企划',
      eyebrow: 'HAPPY MOMENTS',
      description: '那些无比真实的幸福瞬间，无论大小，都同样值得被看见',
      invitation: '进入幸福星域',
    },
    welcome: {
      title: '生命万岁企划',
      intro: ['愿每一份微小幸福', '都被认真看见，并在星空中长久闪烁'],
      countPrefix: '欢迎幸福星域的',
      countNoun: '星星',
      description: ['把那些美好的瞬间', '留在这片属于幸福的星空'],
      features: ['记录今天的小确幸', '收藏值得庆祝的瞬间', '让幸福被温柔看见'],
      enterLabel: '进入幸福宇宙',
    },
    nickname: {
      placeholder: '留下你的别称（1-30个字符）',
      submitLabel: '点亮星星',
      loadingLabel: '正在进入幸福星空...',
      tip: '别称会陪伴你记录每一个幸福时刻',
    },
    sky: {
      title: '生命万岁',
      createLabel: '点亮星星',
      creatingLabel: '正在珍藏...',
      hint: '把值得幸福的事情，留在这片星空里 ☀',
      successNoun: '幸福星星',
      detailNoun: '幸福之星',
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
  const root = id === 'jieyou' ? '/stars' : '/themes/life/stars'
  return starId ? `${root}/${encodeURIComponent(starId)}` : root
}

export const getThemeHealthApiPath = (id: ThemeId): string =>
  id === 'jieyou' ? '/health' : '/themes/life/health'

export const getThemeTodayCountApiPath = (id: ThemeId): string =>
  id === 'jieyou' ? '/stats/today' : '/themes/life/stats/today'
