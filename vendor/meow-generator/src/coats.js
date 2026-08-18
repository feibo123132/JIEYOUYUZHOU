// 花色定义：base 主色，under 腹部/浅色区，stripe 条纹，point 重点色，patch 三花色块
export const COATS = [
  {
    id: 'orange', name: '大橘', kind: 'tabby',
    base: '#e6913f', stripe: '#b96820', under: '#faecd6',
    soft: {
      pattern: 'tabby', base: '#f6dfbd', colorA: '#e6913f', colorB: '#ad5d22',
      softness: 0,
      body: { density: 8.2, width: 0.24, irregularity: 0.42 },
      head: { density: 18, width: 0.2, irregularity: 0.28 },
    },
  },
  {
    id: 'greyTabby', name: '灰狸花', kind: 'tabby',
    base: '#8f959d', stripe: '#565b63', under: '#e6e6ea',
    soft: {
      pattern: 'tabby', base: '#dfe1e4', colorA: '#8f959d', colorB: '#50565f',
      softness: 0,
      body: { density: 10.4, width: 0.18, irregularity: 0.66 },
      head: { density: 21, width: 0.17, irregularity: 0.52 },
    },
  },
  {
    id: 'brownTabby', name: '棕狸花', kind: 'tabby',
    base: '#9a7448', stripe: '#5c4025', under: '#e5d7c0',
    soft: {
      pattern: 'tabby', base: '#dfcfb6', colorA: '#9a7448', colorB: '#563a22',
      softness: 0,
      body: { density: 9.3, width: 0.21, irregularity: 0.72 },
      head: { density: 20, width: 0.18, irregularity: 0.58 },
    },
  },
  {
    id: 'cream', name: '奶油', kind: 'tabby',
    base: '#e3c493', stripe: '#c9a267', under: '#f8eeda',
    soft: {
      pattern: 'tabby', base: '#f7ecd8', colorA: '#e3c493', colorB: '#c49a5e',
      softness: 0,
      body: { density: 7.2, width: 0.28, irregularity: 0.3 },
      head: { density: 16, width: 0.22, irregularity: 0.2 },
    },
  },
  {
    id: 'tuxedo', name: '奶牛', kind: 'tuxedo',
    base: '#2e2f35', under: '#f5f2ec',
    soft: { pattern: 'patch', base: '#f5f2ec', colorA: '#303137', colorB: '#484952', count: 7, scale: 1.42, softness: 0, irregularity: 0.74 },
  },
  {
    id: 'calico', name: '三花', kind: 'calico',
    base: '#f4efe4', patchA: '#e08c3c', patchB: '#35333a',
    soft: { pattern: 'patch', base: '#f4efe4', colorA: '#e08c3c', colorB: '#35333a', count: 10, scale: 1.2, softness: 0, irregularity: 0.96 },
  },
  {
    id: 'tortoiseshell', name: '玳瑁', kind: 'tortoiseshell',
    base: '#302625', patchA: '#cf7632', patchB: '#74412d', under: '#3b2c29',
    soft: { pattern: 'tortoiseshell', base: '#302625', colorA: '#cf7632', colorB: '#74412d', count: 10, scale: 0.92, softness: 0, irregularity: 1.08 },
  },
  {
    id: 'siamese', name: '暹罗', kind: 'points',
    base: '#eadbc0', point: '#5d4636',
    soft: { pattern: 'points', base: '#eadbc0', colorA: '#735746', colorB: '#4e392e', count: 8, scale: 1.16, softness: 0, irregularity: 0.5 },
  },
  {
    id: 'black', name: '黑猫', kind: 'solid',
    base: '#2c2c33', under: '#3c3c45',
    soft: { pattern: 'solid', base: '#292a31', colorA: '#3d3e48', colorB: '#202127', count: 5, scale: 1.7, softness: 0, irregularity: 0.38 },
  },
  {
    id: 'white', name: '白猫', kind: 'solid',
    base: '#f6f3ed', under: '#fffdf8',
    soft: { pattern: 'solid', base: '#f4f0e9', colorA: '#fffdf8', colorB: '#ddd9d2', count: 5, scale: 1.75, softness: 0, irregularity: 0.32 },
  },
  {
    id: 'blueGrey', name: '蓝灰', kind: 'solid',
    base: '#828a99', under: '#aab0bc',
    soft: { pattern: 'solid', base: '#7e8796', colorA: '#a7aebb', colorB: '#697281', count: 6, scale: 1.62, softness: 0, irregularity: 0.42 },
  },
];

export const EYE_COLORS = [
  { id: 'amber',  name: '琥珀',   color: '#d99a2b' },
  { id: 'green',  name: '绿',     color: '#7fae52' },
  { id: 'blue',   name: '蓝',     color: '#5b8fd4' },
  { id: 'copper', name: '铜',     color: '#b06a35' },
  { id: 'hazel',  name: '榛',     color: '#a8973c' },
  { id: 'ice',    name: '冰蓝',   color: '#a8cbe0' },
  { id: 'violet', name: '紫罗兰', color: '#8f7bd8' },
  { id: 'pink',   name: '橘粉',   color: '#e5949c' },
  { id: 'odd',    name: '异瞳',   color: 'odd' },
];

export const POSES = [
  { id: 'standing',  name: '站立' },
  { id: 'loaf',      name: '猫咪面包' },
  { id: 'containerCrouch', name: '随机猫窝' },
  { id: 'stretch',   name: '伸懒腰' },
  { id: 'biped',     name: '双足直立' },
  { id: 'slouchSit', name: '岔腿坐' },
  { id: 'sideFlat',  name: '侧卧摊平' },
  { id: 'banana',       name: '香蕉站立' },
];
