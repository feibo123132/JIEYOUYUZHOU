import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const moduleUrl = new URL('../src/components/SongRequest/songRequest.ts', import.meta.url)
const stationUrl = new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url)
const roadshowModuleUrl = new URL('../src/components/SongRequest/roadshow.ts', import.meta.url)
const roadshowPanelUrl = new URL('../src/components/SongRequest/RoadshowPanel.tsx', import.meta.url)
const cloudAdapterUrl = new URL('../src/components/SongRequest/songRequestCloud.ts', import.meta.url)
const catalogModuleUrl = new URL('../src/components/SongRequest/songCatalog.ts', import.meta.url)
const songRecordsModuleUrl = new URL('../src/components/SongRequest/songRecords.ts', import.meta.url)
const songDetailPanelUrl = new URL('../src/components/SongRequest/SongDetailPanel.tsx', import.meta.url)
const dailyPracticePanelUrl = new URL('../src/components/SongRequest/DailyPracticePanel.tsx', import.meta.url)
const popularSongBarrageUrl = new URL('../src/components/SongRequest/PopularSongBarrage.tsx', import.meta.url)
const messageBarrageUrl = new URL('../src/components/StarrySky/MessageBarrage.tsx', import.meta.url)
const artistSettingsUrl = new URL('../src/components/SongRequest/artistSettings.ts', import.meta.url)
const songQuizLibraryUrl = new URL('../src/components/SongRequest/songQuizLibrary.ts', import.meta.url)
const indexCssUrl = new URL('../src/index.css', import.meta.url)
const appUrl = new URL('../src/App.tsx', import.meta.url)

const songs = [
  { id: 'a', title: '晴天', artist: '周杰伦', category: '华语', featured: true },
  { id: 'b', title: 'Yellow', artist: 'Coldplay', category: '欧美', featured: false },
  { id: 'c', title: '稻香', artist: '周杰伦', category: '华语', featured: true },
]

const requestedPopularSongTitles = [
  '晴天', '小半', '等你下课', '红色高跟鞋', '如果呢', '一笑倾城', '就让这大雨全都落下', '甲乙丙丁',
  '樱花草', '天后', '我们俩', '爱的回归线', '好像爱这个世界啊', '谁', '同花顺', '最后一页', '牵丝戏',
  '有些', '舍得', '若把你', '下完这场雨', '爱情讯息', '离开我的依赖', '寂寞烟火', '海屿你',
  '一个人想着一个人', '我怀念的', '开始懂了', '无人之岛', '富士山下', '遇到', '太阳', '孤雏',
  '雨爱', '如果爱忘了', '如果可以', '太聪明',
]

async function loadModule() {
  assert.ok(existsSync(moduleUrl), 'song request helper must exist')
  return import(moduleUrl.href)
}

async function loadRoadshowModule() {
  assert.ok(existsSync(roadshowModuleUrl), 'roadshow helper must exist')
  return import(roadshowModuleUrl.href)
}

const sampleArtistSettingsPayload = {
  version: 1 as const,
  artistOrder: ['周杰伦', '林俊杰'],
  songOrder: ['a', 'b', 'c'],
  customAvatars: { 周杰伦: 'data:image/webp;base64,UklGRgAAAABXRUJQ' },
  avatarAdjustments: { 周杰伦: { x: 48, y: 32, scale: 1.4, rotation: 2 } },
}

test('artist settings parse snapshots and merge cloud order without hiding new artists', async () => {
  const { parseArtistSettingsSnapshot, mergeArtistOrder, createArtistSettingsPayload } = await import(artistSettingsUrl.href)
  const snapshot = { ...sampleArtistSettingsPayload, revision: 3, updatedAt: '2026-08-28T08:00:00.000Z' }

  assert.deepEqual(parseArtistSettingsSnapshot(snapshot), snapshot)
  assert.equal(parseArtistSettingsSnapshot({ ...snapshot, revision: 0 }), null)
  assert.equal(parseArtistSettingsSnapshot({ ...snapshot, avatarAdjustments: { 周杰伦: { x: 101, y: 32, scale: 1.4, rotation: 2 } } }), null)
  assert.deepEqual(mergeArtistOrder(['林俊杰', '已删除歌手', '周杰伦'], ['周杰伦', '林俊杰', '孙燕姿']), ['林俊杰', '周杰伦', '孙燕姿'])
  assert.deepEqual(createArtistSettingsPayload(
    ['周杰伦'],
    { 周杰伦: sampleArtistSettingsPayload.customAvatars.周杰伦, 已删除歌手: 'data:image/webp;base64,UklGRgAAAABXRUJQ' },
    { 周杰伦: sampleArtistSettingsPayload.avatarAdjustments.周杰伦, 已删除歌手: { x: 50, y: 50, scale: 1, rotation: 0 } },
    sampleArtistSettingsPayload.songOrder,
  ), {
    ...sampleArtistSettingsPayload,
    artistOrder: ['周杰伦'],
  })
})

test('artist settings draft is validated and survives pull conflicts or failures', async () => {
  const {
    ARTIST_SETTINGS_DRAFT_KEY, createArtistSettingsDraft, loadArtistSettingsDraft,
    ensureArtistSettingsRetryDraft, rebaseArtistSettingsDraft, resolveArtistSettingsPull, saveArtistSettingsDraft,
  } = await import(artistSettingsUrl.href)
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const draft = createArtistSettingsDraft(null, 2, sampleArtistSettingsPayload)
  saveArtistSettingsDraft(storage, draft)
  assert.deepEqual(loadArtistSettingsDraft(storage), draft)
  values.set(ARTIST_SETTINGS_DRAFT_KEY, JSON.stringify({ ...draft, snapshot: { version: 1, artistOrder: [], customAvatars: {}, avatarAdjustments: {} } }))
  assert.equal(loadArtistSettingsDraft(storage), null)
  saveArtistSettingsDraft(storage, draft)

  const cloud = { ...sampleArtistSettingsPayload, revision: 3, updatedAt: '2026-08-28T08:00:00.000Z' }
  assert.equal(resolveArtistSettingsPull({ cloud, local: sampleArtistSettingsPayload, draft, hasSession: true, defaultArtistOrder: sampleArtistSettingsPayload.artistOrder, defaultSongOrder: sampleArtistSettingsPayload.songOrder }).kind, 'conflict')
  assert.deepEqual(rebaseArtistSettingsDraft(draft, cloud.revision), {
    ...draft,
    baseRevision: cloud.revision,
  }, 'rebasing must preserve local changes while accepting the latest cloud revision')
  assert.equal(resolveArtistSettingsPull({ cloud: { ...cloud, revision: 2 }, local: sampleArtistSettingsPayload, draft, hasSession: true, defaultArtistOrder: sampleArtistSettingsPayload.artistOrder, defaultSongOrder: sampleArtistSettingsPayload.songOrder }).kind, 'push-draft')
  assert.equal(resolveArtistSettingsPull({ cloud: null, local: sampleArtistSettingsPayload, draft: null, hasSession: true, defaultArtistOrder: ['周杰伦', '林俊杰', '孙燕姿'], defaultSongOrder: sampleArtistSettingsPayload.songOrder }).kind, 'seed-cloud')
  assert.throws(() => { throw new Error('SYNC_FAILED') }, /SYNC_FAILED/)
  assert.deepEqual(loadArtistSettingsDraft(storage), draft, 'pull failure must preserve the local draft')

  values.delete(ARTIST_SETTINGS_DRAFT_KEY)
  const retryDraft = ensureArtistSettingsRetryDraft(
    storage, sampleArtistSettingsPayload, ['周杰伦', '林俊杰', '孙燕姿'], null, sampleArtistSettingsPayload.songOrder,
  )
  assert.deepEqual(loadArtistSettingsDraft(storage), retryDraft, 'a first pull failure must create a retryable draft')
  assert.deepEqual(
    ensureArtistSettingsRetryDraft(storage, sampleArtistSettingsPayload, ['周杰伦', '林俊杰', '孙燕姿'], null, sampleArtistSettingsPayload.songOrder),
    retryDraft,
    'repeated retries must not replace the pending draft',
  )
  values.delete(ARTIST_SETTINGS_DRAFT_KEY)
  const defaultPayload = { ...sampleArtistSettingsPayload, customAvatars: {}, avatarAdjustments: {} }
  assert.equal(
    ensureArtistSettingsRetryDraft(storage, defaultPayload, defaultPayload.artistOrder, null, defaultPayload.songOrder),
    null,
    'default settings must not create an unnecessary cloud draft',
  )
})

test('artist settings successful push only clears the newest draft and rebases later edits', async () => {
  const { createArtistSettingsDraft, resolveSuccessfulArtistSettingsPush } = await import(artistSettingsUrl.href)
  const first = createArtistSettingsDraft(null, 4, sampleArtistSettingsPayload)
  const later = createArtistSettingsDraft(first, 4, { ...sampleArtistSettingsPayload, artistOrder: ['林俊杰', '周杰伦'] })
  const server = { ...sampleArtistSettingsPayload, revision: 5, updatedAt: '2026-08-28T08:05:00.000Z' }

  assert.equal(resolveSuccessfulArtistSettingsPush(first, first.changeId, server), null)
  assert.deepEqual(resolveSuccessfulArtistSettingsPush(later, first.changeId, server), { ...later, baseRevision: 5 })
  assert.deepEqual(resolveSuccessfulArtistSettingsPush(later, 999, server), later)
})

test('点歌台返回按钮仅显示目标名称并保留左箭头', () => {
  const stationSource = readFileSync(stationUrl, 'utf8')

  assert.doesNotMatch(stationSource, /返回(?:点歌台|宇宙)|`返回\$\{/)
  assert.match(stationSource, /<ArrowLeft className="h-4 w-4" \/> 点歌台/)
  assert.match(stationSource, /activeSection === null \? '宇宙'/)
})

test('入口和登录卡片统一使用私人记录文案', () => {
  const stationSource = readFileSync(stationUrl, 'utf8')
  const roadshowSource = readFileSync(roadshowPanelUrl, 'utf8')

  assert.match(stationSource, /id: 'roadshows', label: '私人记录'/)
  assert.match(roadshowSource, />私人记录<\/h2>/)
  assert.doesNotMatch(roadshowSource, /仅属于你的私人档案/)
})

test('游客能读取脱敏个人练习榜但不能进入私人歌曲档案', async () => {
  const { parsePublicPracticeRanking } = await import(songRecordsModuleUrl.href)
  const source = readFileSync(stationUrl, 'utf8')

  assert.deepEqual(parsePublicPracticeRanking([
    { songId: 'a', songTitle: '晴天', songArtist: '周杰伦', score: 86, occurredAt: 'private', practiceCount: 9 },
    { songId: '', songTitle: '无效', songArtist: '', score: 88 },
    { songId: 'b', songTitle: 'Yellow', songArtist: 'Coldplay', score: 69 },
  ]), [{ songId: 'a', songTitle: '晴天', songArtist: '周杰伦', score: 86 }])
  assert.match(source, /pullPublicPracticeRanking/)
  assert.match(source, /const canOpenPracticeDetails = Boolean\(songRecordSession\)/)
  assert.match(source, /disabled=\{!canOpenPracticeDetails\}/)
  assert.match(source, /canOpenPracticeDetails \? `\$\{song\.artist\} · 练习 \$\{practiceCount\} 次` : song\.artist/)
  assert.doesNotMatch(source, /请先进入私有空间查看个人练习榜/)
})

test('周杰伦歌单按指定顺序包含 30 首歌', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const titles = SONGS
    .filter((song: { artist: string }) => song.artist === '周杰伦')
    .map((song: { title: string }) => song.title)

  assert.deepEqual(titles, [
    '晴天', '青花瓷', '等你下课', '红尘客栈', '告白气球', '一路向北', '花海', '蒲公英的约定', '明明就', '枫',
    '不能说的秘密', '搁浅', '兰亭序', '手写的从前', '半岛铁盒', '我落泪情绪零碎', '那天下雨了', '简单爱', '园游会', '夏天的风',
    '最长的电影', '龙卷风', '烟花易冷', '退后', '倒带', '安静', '彩虹', '哪里都是你', '轨迹', '说好的幸福呢',
  ])
})

test('周杰伦前 10 首歌按顺序保存热评且不带序号', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const comments = SONGS.filter((song: { artist: string }) => song.artist === '周杰伦')
    .slice(0, 10)
    .map((song: { hotComment?: string }) => song.hotComment)

  assert.deepEqual(comments, [
    '故事的小黄花，从出生那年就飘着',
    '天青色等烟雨，而我在等你',
    '复读时我要好好学习，考上和你一样的大学',
    '红尘客栈风似刀，骤雨落宿命敲',
    '少年的脸红胜过一切情话',
    '拓海跑赢了所有人，但还是输给了那辆奔驰',
    '听说，花海的前奏和晴天一样好听',
    '而我已经分不清，你是友情，还是错过的爱情',
    '她明明就只是看了你一眼，你却在心里演了无数场电影',
    '天冷的季节听这首歌，会有不一样的感觉。',
  ])
})

test('周杰伦第 11 至 20 首歌按顺序保存热评且不带序号', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const comments = SONGS.filter((song: { artist: string }) => song.artist === '周杰伦')
    .slice(10, 20)
    .map((song: { hotComment?: string }) => song.hotComment)

  assert.deepEqual(comments, [
    '最美的不是下雨天🌧️，而是与你躲过雨的屋檐',
    '后半段升调很好听是真的，但唱不上去也是真的！',
    '喜欢王羲之的兰亭集序，也喜欢杰伦的兰亭序',
    '青春属于表白，阳光属于窗台，而我想我属于一个拥有你的未来',
    '小姐请问一下，有没有卖半岛铁盒？',
    '七里香的姐妹曲',
    '从晴天的遗憾，到那天下雨了的和解',
    '我想带你回我的外婆家，一起看着日落，一直到我们都睡着',
    '有钱的时候跑到塞纳河畔喝咖啡，没钱的时候就只能去园游会捞鱼了',
    '杰伦15岁时做出来的曲子，《夏天》给了李玖哲，《夏天的风》给了温岚',
  ])
})

test('周杰伦第 21 至 30 首歌按顺序保存热评且不带序号', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const comments = SONGS.filter((song: { artist: string }) => song.artist === '周杰伦')
    .slice(20, 30)
    .map((song: { hotComment?: string }) => song.hotComment)

  assert.deepEqual(comments, [
    '那年学校晚会在台上这首歌，看到喜欢的女孩和男朋友在角落kiss，边唱边落泪，观众都以为我唱得太投入了',
    '龙卷风刮了二十多年了，依然没停',
    '雨纷纷，旧故里草木深，我听闻你始终一个人',
    '喜欢周杰伦26年了，从少女到妇女，算算也有大半辈子了',
    'Jolin不仅是公主，更是女王',
    '老师：安静！我：哟不错哦，挺有品味的',
    '这是我和妻子在一起时合唱的第一首歌',
    '在有眼泪的雨里，哪里都是你',
    '头低低先生和微微笑小姐',
    '20160204：初中时，家里，学校广播，大街小巷，都是这首歌！',
  ])
})

test('曲库按指定歌手与歌曲顺序保存，且每首歌均有独立文案', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const catalogSource = readFileSync(catalogModuleUrl, 'utf8')
  const expectedByArtist: Record<string, string[]> = {
    周杰伦: ['晴天', '青花瓷', '等你下课', '红尘客栈', '告白气球', '一路向北', '花海', '蒲公英的约定', '明明就', '枫', '不能说的秘密', '搁浅', '兰亭序', '手写的从前', '半岛铁盒', '我落泪情绪零碎', '那天下雨了', '简单爱', '园游会', '夏天的风', '最长的电影', '龙卷风', '烟花易冷', '退后', '倒带', '安静', '彩虹', '哪里都是你', '轨迹', '说好的幸福呢'],
    林俊杰: ['江南', '心墙', '当你', '修炼爱情', '不潮不用花钱', '我还想她', '背对背拥抱', 'Always on line', '小酒窝', '醉赤壁', '裹着心的光', '愿与愁', '黑夜问白天', '一千年以后', '交换余生', '裂缝中的阳光', '她说', '那些你很冒险的梦'],
    孙燕姿: ['我怀念的', '开始懂了', '遇见', '我不难过', '第一天', '半句再见', '逆光', '天黑黑', '雨天', '当冬夜渐暖'],
    邓紫棋: ['多远都要在一起', '唯一', '喜欢你', '来自天堂的魔鬼', '光年之外', '句号', '倒数', '龙卷风'],
    薛之谦: ['刚刚好', '演员', '你还要我怎样', '意外', '方圆几里', '其实', '陪你去流浪', '天外来物', '绅士', '像风一样', '我好像在哪见过你', '暧昧', '天份', '哑巴'],
    汪苏泷: ['一笑倾城', '就让这大雨全都落下', '万有引力', '如果爱忘了', '如果可以', '忽而今夏', '我想念', '年轮'],
    梁静茹: ['勇气', '会呼吸的痛', '情歌', '大手拉小手', '可惜不是你', '给未来的自己', '暖暖', '分手快乐', '崇拜', '宁夏'],
    陶喆: ['就是爱你', '爱很简单', '蝴蝶', '找自己', '小镇姑娘', '爱我还是他', '普通朋友', '流沙'],
    王力宏: ['爱错', '你不知道的事', '依然爱你', '需要人陪', '大城小爱'],
    许嵩: ['素颜', '有何不可', '宿敌', '如果当时', '清明雨上', '最佳歌手', '庐州月'],
    陈奕迅: ['富士山下', '爱情转移', '最佳损友', '淘汰', '好久不见', '葡萄成熟时', '阴天快乐'],
    郑润泽: ['如果呢', '于是', '瞬', '遐想'],
    陈粒: ['小半', '奇妙能力歌', '虚拟'],
    蔡健雅: ['红色高跟鞋', 'letting go', '别找我麻烦', '思念是一种病', '停格', '达尔文'],
    陈绮贞: ['太聪明', '旅行的意义', '我爱上你时的心理活动'],
    李佳薇: ['甲乙丙丁'],
    Sweety: ['樱花草'],
    陈势安: ['天后'],
    郭顶: ['我们俩'],
    '陈韵若、陈每文': ['爱的回归线'],
    华晨宇: ['好像爱这个世界啊', '向阳而生', '烟火里的尘埃'],
    廖俊涛: ['谁'],
    林倛玉: ['同花顺'],
    江语晨: ['最后一页'],
    '银临、Aki阿杰': ['牵丝戏'],
    颜人中: ['有些'],
    王唯旖: ['舍得'],
    Kirsty刘瑾睿: ['若把你'],
    后弦: ['下完这场雨'],
    郭静: ['爱情讯息', '心墙', '下一个天亮'],
    王艳薇: ['离开我的依赖'],
    朱婧汐: ['寂寞烟火'],
    '马也_Crabbit、Cole先生': ['海屿你'],
    曾沛慈: ['一个人想着一个人'],
    任然: ['无人之岛'],
    方雅贤: ['遇到'],
    邱振哲: ['太阳'],
    AGA: ['孤雏'],
    杨丞琳: ['雨爱'],
    'Taylor Swift': ['Love story', 'Exile'],
    'Justin Bieber': ['Baby', '10000 hours'],
    五月天: ['知足', '温柔', '倔强', '步步', '突然好想你', '我不愿让你一个人', '后来的我们', '拥抱'],
    赵雷: ['成都', '鼓楼', '程艾影', '我记得', '少年锦时', '玛丽', '南方姑娘'],
    Alin: ['天若有情', '有一种悲伤', '给我一个理由忘记', '忘记拥抱'],
    卢广仲: ['几分之几', '刻在我心底的名字'],
    房东的猫: ['下一站茶山刘', '少年时', 'new boy', '和宇宙温柔相关', '星星在唱歌', '所念皆星河', '云烟成雨'],
    莫文蔚: ['这世界有那么多人', '慢慢喜欢你', '忽然之间', '当你老了', '阴天'],
    胡歌: ['指纹', '忘记时间'],
    林宥嘉: ['说谎', '想自由', '浪费'],
    张韶涵: ['欧若拉', '亲爱的，那不是爱情', '有形的翅膀', '隐形的翅膀', '如果的事'],
    买辣椒也用券: ['起风了', '第三人称'],
    毛不易: ['一荤一素', '平凡的一天', '二零三', '像我这样的人', '一程山路', '给你给我', '问', '消愁'],
    李荣浩: ['慢冷', '不将就', '不遗憾', '走走', '年少有为', '戒烟', '麻雀', '李白', '乌梅子酱'],
    方大同: ['特别的人', '三人游'],
    薛凯琪: ['苏州河', '奇洛李维斯回信'],
    'Garath.T': ['玻璃', '颜色', '去北极忘记你'],
    杨千嬅: ['可惜我是水瓶座', '勇'],
    谢安琪: ['喜帖街', '钟无艳', '我们都被忘了', '年度之歌'],
  }

  assert.deepEqual([...new Set(SONGS.map((song: { artist: string }) => song.artist))], Object.keys(expectedByArtist))
  for (const [artist, titles] of Object.entries(expectedByArtist)) {
    assert.deepEqual(SONGS.filter((song: { artist: string }) => song.artist === artist).map((song: { title: string }) => song.title), titles)
  }
  assert.equal(new Set(SONGS.map((song: { id: string }) => song.id)).size, SONGS.length)
  assert.deepEqual([...new Set(SONGS.map((song: { category: string }) => song.category))], ['华语流行', '欧美流行'])
  assert.equal(SONGS.filter((song: { category: string }) => song.category === '欧美流行').length, 4)
  assert.ok(SONGS.every((song: { hotComment?: string }) => Boolean(song.hotComment?.trim())))
  assert.deepEqual(SONGS.filter((song: { featured: boolean }) => song.featured).map((song: { title: string }) => song.title).sort(), [...requestedPopularSongTitles].sort())
  assert.doesNotMatch(catalogSource, /POPULAR_SONG_TITLES|POPULAR_SONG_TITLE_SET/)
  assert.doesNotMatch(catalogSource, /SONG_CATALOG\.map/)
})

test('新增十五位歌手的六十首歌曲均带热评并正确区分中外语种', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const requested: Record<string, string[]> = {
    'Taylor Swift': ['Love story', 'Exile'],
    'Justin Bieber': ['Baby', '10000 hours'],
    华晨宇: ['好像爱这个世界啊', '向阳而生', '烟火里的尘埃'],
    五月天: ['知足', '温柔', '倔强', '步步', '突然好想你', '我不愿让你一个人', '后来的我们', '拥抱'],
    陈粒: ['奇妙能力歌', '小半', '虚拟'],
    蔡健雅: ['红色高跟鞋', 'letting go', '别找我麻烦', '思念是一种病', '停格', '达尔文'],
    陈绮贞: ['太聪明', '旅行的意义', '我爱上你时的心理活动'],
    赵雷: ['成都', '鼓楼', '程艾影', '我记得', '少年锦时', '玛丽', '南方姑娘'],
    Alin: ['天若有情', '有一种悲伤', '给我一个理由忘记', '忘记拥抱'],
    卢广仲: ['几分之几', '刻在我心底的名字'],
    房东的猫: ['下一站茶山刘', '少年时', 'new boy', '和宇宙温柔相关', '星星在唱歌', '所念皆星河', '云烟成雨'],
    郭静: ['心墙', '爱情讯息', '下一个天亮'],
    莫文蔚: ['这世界有那么多人', '慢慢喜欢你', '忽然之间', '当你老了', '阴天'],
    胡歌: ['指纹', '忘记时间'],
    林宥嘉: ['说谎', '想自由', '浪费'],
  }
  const requestedSongs = Object.entries(requested).flatMap(([artist, titles]) => titles.map((title) => (
    SONGS.find((song: { artist: string, title: string }) => song.artist === artist && song.title === title)
  )))

  assert.equal(requestedSongs.length, 60)
  assert.ok(requestedSongs.every(Boolean))
  assert.ok(requestedSongs.every((song: { hotComment?: string } | undefined) => Boolean(song?.hotComment?.trim())))
  assert.equal(new Set(requestedSongs.map((song: { hotComment?: string } | undefined) => song?.hotComment)).size, 60)
  assert.ok(requestedSongs.filter((song: { artist?: string } | undefined) => ['Taylor Swift', 'Justin Bieber'].includes(song?.artist ?? '')).every((song: { category?: string } | undefined) => song?.category === '欧美流行'))
  assert.ok(requestedSongs.filter((song: { artist?: string } | undefined) => !['Taylor Swift', 'Justin Bieber'].includes(song?.artist ?? '')).every((song: { category?: string } | undefined) => song?.category === '华语流行'))
})

test('新增九位歌手及陈奕迅的四十二首歌曲均带独立热评', async () => {
  const { SONGS } = await import(catalogModuleUrl.href)
  const requested: Record<string, string[]> = {
    张韶涵: ['欧若拉', '亲爱的，那不是爱情', '有形的翅膀', '隐形的翅膀', '如果的事'],
    买辣椒也用券: ['起风了', '第三人称'],
    毛不易: ['一荤一素', '平凡的一天', '二零三', '像我这样的人', '一程山路', '给你给我', '问', '消愁'],
    李荣浩: ['慢冷', '不将就', '不遗憾', '走走', '年少有为', '戒烟', '麻雀', '李白', '乌梅子酱'],
    方大同: ['特别的人', '三人游'],
    薛凯琪: ['苏州河', '奇洛李维斯回信'],
    'Garath.T': ['玻璃', '颜色', '去北极忘记你'],
    杨千嬅: ['可惜我是水瓶座', '勇'],
    谢安琪: ['喜帖街', '钟无艳', '我们都被忘了', '年度之歌'],
    陈奕迅: ['最佳损友', '淘汰', '好久不见', '葡萄成熟时', '阴天快乐'],
  }
  const requestedSongs = Object.entries(requested).flatMap(([artist, titles]) => titles.map((title) => (
    SONGS.find((song: { artist: string, title: string }) => song.artist === artist && song.title === title)
  )))

  assert.equal(requestedSongs.length, 42)
  assert.ok(requestedSongs.every(Boolean))
  assert.ok(requestedSongs.every((song: { category?: string } | undefined) => song?.category === '华语流行'))
  assert.ok(requestedSongs.every((song: { hotComment?: string } | undefined) => Boolean(song?.hotComment?.trim())))
  assert.equal(new Set(requestedSongs.map((song: { hotComment?: string } | undefined) => song?.hotComment)).size, 42)
})

test('第三版曲库缓存会补齐新默认歌曲并升级到第七版', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const newDefaultSong = { id: 'default:new-v4', title: '新增默认歌', artist: '新增歌手', category: '华语流行', featured: false, hotComment: '新增热评' }
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY
      ? JSON.stringify({ version: 3, artists: ['周杰伦', 'Coldplay'], songs })
      : null,
  }

  const catalog = loadEditableCatalog(storage, [...songs, newDefaultSong])

  assert.equal(catalog.version, 7)
  assert.ok(catalog.artists.includes('新增歌手'))
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === newDefaultSong.id)?.title, '新增默认歌')
})

test('filters the catalog by title, artist, and category', async () => {
  const { filterSongs } = await loadModule()

  assert.deepEqual(filterSongs(songs, '晴', '全部').map((song: { id: string }) => song.id), ['a'])
  assert.deepEqual(filterSongs(songs, '周杰伦', '全部').map((song: { id: string }) => song.id), ['a', 'c'])
  assert.deepEqual(filterSongs(songs, '', '欧美').map((song: { id: string }) => song.id), ['b'])
})

test('热评仅替换歌曲副标题，不覆盖分类数据', async () => {
  const { getSongSubtitle } = await loadModule()
  const song = { ...songs[0], hotComment: '我们在晴天里说了再见。' }

  assert.equal(getSongSubtitle(song), '我们在晴天里说了再见。')
  assert.equal(getSongSubtitle(songs[0]), '周杰伦 · 华语')
  assert.equal(song.category, '华语')
})

test('可编辑曲库支持增删歌手和歌曲并本地持久化', async () => {
  const {
    addCatalogArtist, addCatalogSong, createEditableCatalog, loadEditableCatalog,
    insertCatalogArtist, moveCatalogArtist, removeCatalogArtist, removeCatalogSong, saveEditableCatalog,
  } = await loadModule()
  const storageValues = new Map<string, string>()
  const storage = {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => { storageValues.set(key, value) },
  }

  let catalog = createEditableCatalog(songs)
  catalog = addCatalogArtist(catalog, '新歌手')
  catalog = addCatalogSong(catalog, { id: 'custom:1', title: '新歌', artist: '新歌手', category: '华语流行', featured: false, hotComment: '新热评' })
  assert.deepEqual(catalog.artists, ['周杰伦', 'Coldplay', '新歌手'])
  assert.equal(catalog.songs.at(-1)?.title, '新歌')

  catalog = moveCatalogArtist(catalog, 'Coldplay', '周杰伦')
  assert.deepEqual(catalog.artists, ['Coldplay', '周杰伦', '新歌手'])

  catalog = insertCatalogArtist(catalog, 'Coldplay', '新歌手', 'after')
  assert.deepEqual(catalog.artists, ['周杰伦', '新歌手', 'Coldplay'])
  catalog = insertCatalogArtist(catalog, 'Coldplay', '周杰伦', 'before')
  assert.deepEqual(catalog.artists, ['Coldplay', '周杰伦', '新歌手'])

  catalog = removeCatalogSong(catalog, 'custom:1')
  assert.equal(catalog.songs.some((song: { id: string }) => song.id === 'custom:1'), false)
  catalog = addCatalogSong(catalog, { id: 'custom:2', title: '新歌', artist: '新歌手', category: '华语流行', featured: false })
  catalog = removeCatalogArtist(catalog, '新歌手')
  assert.equal(catalog.artists.includes('新歌手'), false)
  assert.equal(catalog.songs.some((song: { artist: string }) => song.artist === '新歌手'), false)

  saveEditableCatalog(storage, catalog)
  assert.deepEqual(loadEditableCatalog(storage, songs), catalog)
})

test('旧版曲库快照会补齐新版默认歌手并保留自定义歌曲', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const customSong = {
    id: 'custom:legacy', title: '自定义歌曲', artist: '自定义歌手', category: '华语流行', featured: false,
  }
  const newDefaultSong = {
    id: 'default:new', title: '新版歌曲', artist: '新默认歌手', category: '华语流行', featured: false,
  }
  const legacyCatalog = {
    version: 1,
    artists: ['周杰伦', '自定义歌手'],
    songs: [songs[0], customSong],
  }
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY ? JSON.stringify(legacyCatalog) : null,
  }

  const catalog = loadEditableCatalog(storage, [...songs, newDefaultSong])

  assert.equal(catalog.version, 7)
  assert.deepEqual(catalog.artists, ['周杰伦', 'Coldplay', '新默认歌手', '自定义歌手'])
  assert.deepEqual(catalog.songs.map((song: { id: string }) => song.id), ['a', 'b', 'c', 'default:new', 'custom:legacy'])
})

test('第四版曲库快照会补齐默认歌曲、同步热门标记并保留自定义歌曲', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const cachedSongs = songs.map((song) => ({ ...song, featured: false }))
  const newDefaultSong = { id: 'default:new', title: '新版热门歌', artist: '新歌手', category: '华语流行', featured: true }
  const customSong = { id: 'custom:kept', title: '保留的自定义歌曲', artist: '自定义歌手', category: '华语流行', featured: true }
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY
      ? JSON.stringify({ version: 4, artists: ['周杰伦', 'Coldplay', '自定义歌手'], songs: [...cachedSongs, customSong] })
      : null,
  }

  const catalog = loadEditableCatalog(storage, [...songs, newDefaultSong])

  assert.equal(catalog.version, 7)
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'a')?.featured, true)
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'default:new')?.title, '新版热门歌')
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'custom:kept')?.title, '保留的自定义歌曲')
  assert.ok(catalog.artists.includes('新歌手'))
  assert.ok(catalog.artists.includes('自定义歌手'))
})

test('第五版曲库缓存会同步默认歌曲的歌手更正并保留自定义歌曲', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const correctedSongs = [
    { ...songs[0], artist: '李佳薇' },
    { ...songs[1], artist: '王唯旖' },
  ]
  const cachedSongs = [
    { ...songs[0], artist: '张学友、郑中基、许志安' },
    { ...songs[1], artist: '王呈章' },
    { id: 'custom:kept', title: '保留歌曲', artist: '自定义歌手', category: '华语', featured: false },
  ]
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY
      ? JSON.stringify({ version: 5, artists: ['张学友、郑中基、许志安', '王呈章', '自定义歌手'], songs: cachedSongs })
      : null,
  }

  const catalog = loadEditableCatalog(storage, correctedSongs)

  assert.equal(catalog.version, 7)
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === songs[0].id)?.artist, '李佳薇')
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === songs[1].id)?.artist, '王唯旖')
  assert.ok(catalog.songs.some((song: { id: string }) => song.id === 'custom:kept'))
  assert.deepEqual(catalog.artists, ['李佳薇', '王唯旖', '自定义歌手'])
})

test('第六版曲库缓存会补齐第七版新增歌手歌曲并保留自定义歌曲', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const newDefaultSong = { id: 'default:new-v7', title: '新增歌曲', artist: '新增歌手', category: '华语流行', featured: false, hotComment: '新增热评' }
  const customSong = { id: 'custom:kept-v7', title: '自定义歌曲', artist: '自定义歌手', category: '华语流行', featured: false }
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY
      ? JSON.stringify({ version: 6, artists: ['周杰伦', 'Coldplay', '自定义歌手'], songs: [...songs, customSong] })
      : null,
  }

  const catalog = loadEditableCatalog(storage, [...songs, newDefaultSong])

  assert.equal(catalog.version, 7)
  assert.ok(catalog.artists.includes('新增歌手'))
  assert.ok(catalog.songs.some((song: { id: string }) => song.id === newDefaultSong.id))
  assert.ok(catalog.songs.some((song: { id: string }) => song.id === customSong.id))
})

test('歌曲记录支持同一首歌多次练习并按时间倒序过滤无效云端数据', async () => {
  assert.ok(existsSync(songRecordsModuleUrl), 'song record helper must exist')
  const { parseSongRecords } = await import(songRecordsModuleUrl.href)
  const practice = (id: string, occurredAt: string) => ({
    id, kind: 'practice', songId: 'a', songTitle: '晴天', songArtist: '周杰伦', occurredAt,
    matchScore: 86, feelings: '适合我的音色', problems: '', improvements: '降低速度练习',
    updatedAt: occurredAt,
  })

  const records = parseSongRecords([{ ...practice('older', '2026-08-20T10:00:00.000Z'), durationMinutes: 30 }, { bad: true }, practice('newer', '2026-08-25T10:00:00.000Z')])

  assert.deepEqual(records.map((record: { id: string }) => record.id), ['newer', 'older'])
  assert.equal('durationMinutes' in records[1], false)
})

test('歌曲记录校验匹配度、文本以及路演反馈', async () => {
  const { isValidSongRecord } = await import(songRecordsModuleUrl.href)
  const base = {
    id: 'practice-1', kind: 'practice', songId: 'a', songTitle: '晴天', songArtist: '周杰伦',
    occurredAt: '2026-08-25T10:00:00.000Z', matchScore: 80,
    feelings: '', problems: '副歌换和弦慢', improvements: '', updatedAt: '2026-08-25T10:10:00.000Z',
  }

  assert.equal(isValidSongRecord(base), true)
  assert.equal(isValidSongRecord({ ...base, matchScore: 70 }), true)
  assert.equal(isValidSongRecord({ ...base, matchScore: 69 }), false)
  assert.equal(isValidSongRecord({ ...base, feelings: '', problems: '', improvements: '' }), true)
  assert.equal(isValidSongRecord({ ...base, kind: 'roadshow', audienceName: '', feedback: '观众觉得副歌很有共鸣' }), true)
  assert.equal(isValidSongRecord({ ...base, kind: 'roadshow', audienceName: '', feedback: '  ' }), false)
})

test('匹配度输入允许暂时清空后再输入新分数', async () => {
  const { parseMatchScoreInput } = await import(songRecordsModuleUrl.href)

  assert.equal(parseMatchScoreInput(''), '')
  assert.equal(parseMatchScoreInput('78'), 78)
})

test('匹配度自动锁定品质并区分普通与两档精良颜色', async () => {
  const { getMatchQuality } = await import(songRecordsModuleUrl.href)

  assert.deepEqual(getMatchQuality(70), { label: '普通', tone: 'white' })
  assert.deepEqual(getMatchQuality(74), { label: '普通', tone: 'white' })
  assert.deepEqual(getMatchQuality(75), { label: '优秀', tone: 'green' })
  assert.deepEqual(getMatchQuality(79), { label: '优秀', tone: 'green' })
  assert.deepEqual(getMatchQuality(80), { label: '精良', tone: 'lightBlue' })
  assert.deepEqual(getMatchQuality(84), { label: '精良', tone: 'lightBlue' })
  assert.deepEqual(getMatchQuality(85), { label: '精良', tone: 'darkBlue' })
  assert.deepEqual(getMatchQuality(89), { label: '精良', tone: 'darkBlue' })
  assert.deepEqual(getMatchQuality(90), { label: '稀有', tone: 'purple' })
  assert.deepEqual(getMatchQuality(95), { label: '稀有', tone: 'purple' })
  assert.deepEqual(getMatchQuality(96), { label: '传奇', tone: 'gold' })
  assert.deepEqual(getMatchQuality(100), { label: '传奇', tone: 'gold' })
  assert.equal(getMatchQuality(69), null)
  assert.equal(getMatchQuality(101), null)
})

test('练习时间匹配度和只读品质在同一行展示', () => {
  const panel = readFileSync(songDetailPanelUrl, 'utf8')

  assert.match(panel, /sm:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(90px,\.8fr\)_minmax\(90px,\.8fr\)\]/)
  assert.match(panel, /<Field label="品质">/)
  assert.match(panel, /aria-readonly="true"/)
  assert.match(panel, /text-white/)
  assert.match(panel, /text-emerald-400/)
  assert.match(panel, /text-sky-300/)
  assert.match(panel, /text-blue-600/)
  assert.match(panel, /text-purple-400/)
  assert.match(panel, /text-amber-300/)
})

test('日常练习按月周日压缩分组并统计每天数据', async () => {
  const { groupPracticeRecordsByCalendar } = await import(songRecordsModuleUrl.href)
  const practice = (id: string, occurredAt: string, matchScore: number) => ({
    id, kind: 'practice' as const, songId: id, songTitle: id, songArtist: '', occurredAt, updatedAt: occurredAt,
    matchScore, feelings: '', problems: '', improvements: '',
  })
  const groups = groupPracticeRecordsByCalendar([
    practice('a', '2026-08-24T12:00:00.000Z', 80),
    practice('b', '2026-08-25T12:00:00.000Z', 90),
    practice('c', '2026-08-25T13:00:00.000Z', 85),
    practice('d', '2026-08-31T12:00:00.000Z', 96),
  ])

  assert.deepEqual(groups.map((month: { key: string }) => month.key), ['2026-08'])
  assert.deepEqual(groups[0].weeks.map((week: { key: string }) => week.key), ['2026-08-31', '2026-08-24'])
  assert.deepEqual(groups[0].weeks[1].days.map((day: { key: string }) => day.key), ['2026-08-25', '2026-08-24'])
  assert.equal(groups[0].weeks[1].days[0].count, 2)
  assert.equal(groups[0].weeks[1].days[0].averageScore, 87.5)
})

test('歌曲详情匹配度统计使用全部练习记录的平均值', async () => {
  const { averageMatchScore } = await import(songRecordsModuleUrl.href)

  assert.equal(typeof averageMatchScore, 'function')
  assert.equal(averageMatchScore([{ matchScore: 80 }, { matchScore: 85 }]), 82.5)
  assert.equal(averageMatchScore([{ matchScore: 80 }, { matchScore: 90 }]), 85)
  assert.equal(averageMatchScore([]), null)
})

test('个人榜按每首歌的平均匹配度降序排名', async () => {
  const { rankSongsByPracticeMatch } = await import(songRecordsModuleUrl.href)
  const practice = (id: string, songId: string, matchScore: number) => ({
    id, kind: 'practice' as const, songId, songTitle: songId, songArtist: '',
    occurredAt: '2026-08-25T10:00:00.000Z', updatedAt: '2026-08-25T10:00:00.000Z',
    matchScore, feelings: '练习', problems: '', improvements: '',
  })
  const records = [practice('a1', 'a', 80), practice('a2', 'a', 90), practice('b1', 'b', 92)]

  assert.deepEqual(rankSongsByPracticeMatch(songs, records).map((item: { song: { id: string }, score: number, practiceCount: number }) => (
    [item.song.id, item.score, item.practiceCount]
  )), [['b', 92, 1], ['a', 85, 2]])
})

test('旧练习记录的问题与改进会合并为弹唱感想', async () => {
  const { getPracticeReflection } = await import(songRecordsModuleUrl.href)

  assert.equal(typeof getPracticeReflection, 'function')
  assert.equal(getPracticeReflection({ problems: '副歌换和弦卡顿', improvements: '分段慢练' }), '副歌换和弦卡顿\n分段慢练')
  assert.equal(getPracticeReflection({ problems: '', improvements: '降低速度' }), '降低速度')
})

test('歌曲记录缓存按别称隔离且锁定后可以清除', async () => {
  const { clearSongRecordCache, loadSongRecordCache, saveSongRecordCache, songRecordCacheKey } = await import(songRecordsModuleUrl.href)
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const record = {
    id: 'roadshow-1', kind: 'roadshow', songId: 'a', songTitle: '晴天', songArtist: '周杰伦',
    occurredAt: '2026-08-25T10:00:00.000Z', audienceName: '小林', feedback: '想再听一次', updatedAt: '2026-08-25T10:00:00.000Z',
  }

  saveSongRecordCache(storage, ' JIEYOU ', [record])
  assert.deepEqual(loadSongRecordCache(storage, { alias: 'jieyou', password: 'secret1' }).map((item: { id: string }) => item.id), ['roadshow-1'])
  assert.deepEqual(loadSongRecordCache(storage, { alias: '别人', password: 'secret2' }), [])
  assert.deepEqual(loadSongRecordCache(storage, null), [])
  clearSongRecordCache(storage, 'jieyou')
  assert.equal(values.has(songRecordCacheKey('JIEYOU')), false)
})

test('歌曲记录快照只恢复当前私有会话缺少的自定义歌曲', async () => {
  const { recoverSongsFromRecords } = await import(songRecordsModuleUrl.href)
  const records = [{
    id: 'practice-custom', kind: 'practice', songId: 'custom:later', songTitle: '后来', songArtist: '刘若英',
    occurredAt: '2026-08-25T10:00:00.000Z', matchScore: 80,
    feelings: '合适', problems: '', improvements: '', updatedAt: '2026-08-25T10:00:00.000Z',
  }]

  assert.deepEqual(recoverSongsFromRecords(records, songs), [{
    id: 'custom:later', title: '后来', artist: '刘若英', category: '私有自定义', featured: false,
  }])
})

test('featured songs remain an unranked catalog subset', async () => {
  const { getFeaturedSongs, isFeaturedSongManager } = await loadModule()
  assert.deepEqual(getFeaturedSongs(songs).map((song: { id: string }) => song.id), ['a', 'c'])
  assert.equal(isFeaturedSongManager(' 2421415030@QQ.COM '), true)
  assert.equal(isFeaturedSongManager('visitor@example.com'), false)
})

test('识曲歌库按四档解析、切换、取消并分组计数', async () => {
  const {
    QUIZ_LEVELS, parseQuizAssignments, setQuizLevel, groupQuizSongs, countQuizSongs,
  } = await import(songQuizLibraryUrl.href)
  assert.deepEqual(QUIZ_LEVELS.map((level: { id: string, label: string }) => [level.id, level.label]), [
    ['warmup', '简单'], ['standard', '常规'], ['hard', '较难'], ['hell', '很难'],
  ])
  assert.deepEqual(parseQuizAssignments({ a: 'warmup', b: 'hell' }), { a: 'warmup', b: 'hell' })
  assert.equal(parseQuizAssignments({ a: 'unknown' }), null)
  assert.equal(parseQuizAssignments(Array(3).fill('warmup')), null)

  const assigned = setQuizLevel({}, 'a', 'standard')
  assert.deepEqual(assigned, { a: 'standard' })
  assert.deepEqual(setQuizLevel(assigned, 'a', 'standard'), {})
  assert.deepEqual(setQuizLevel(assigned, 'a', 'hard'), { a: 'hard' })

  const grouped = groupQuizSongs(songs, { a: 'warmup', b: 'hell', missing: 'hard' })
  assert.deepEqual(grouped.warmup.map((song: { id: string }) => song.id), ['a'])
  assert.deepEqual(grouped.hell.map((song: { id: string }) => song.id), ['b'])
  assert.deepEqual(countQuizSongs({ a: 'warmup', b: 'hell', missing: 'hard' }), {
    total: 3, warmup: 1, standard: 0, hard: 1, hell: 1,
  })
})

test('一键选歌按6比10比10比4抽取三十首并排除往期已用歌曲', async () => {
  const { QUIZ_ROADSHOW_QUOTAS, selectQuizSongsForRoadshow } = await import(songQuizLibraryUrl.href)
  const levels = ['warmup', 'standard', 'hard', 'hell'] as const
  const quotas = { warmup: 6, standard: 10, hard: 10, hell: 4 }
  const catalog = levels.flatMap((level) => Array.from({ length: quotas[level] + 2 }, (_, index) => ({
    id: `${level}-${index}`, title: `${level}-${index}`, artist: '测试歌手', category: '测试', featured: false,
  })))
  const assignments = Object.fromEntries(catalog.map((song) => [song.id, song.id.split('-')[0]]))
  const usedIds = new Set(levels.map((level) => `${level}-0`))

  assert.deepEqual(QUIZ_ROADSHOW_QUOTAS, quotas)
  const selected = selectQuizSongsForRoadshow(catalog, assignments, usedIds, () => 0.5)
  assert.equal(selected.kind, 'selected')
  assert.equal(selected.songs.length, 30)
  assert.equal(selected.songs.some((song: { id: string }) => usedIds.has(song.id)), false)
  assert.deepEqual(Object.fromEntries(levels.map((level) => [
    level, selected.songs.filter((song: { id: string }) => assignments[song.id] === level).length,
  ])), quotas)

  const insufficient = selectQuizSongsForRoadshow(catalog, assignments, new Set([
    'warmup-0', 'warmup-1', 'warmup-2',
  ]), () => 0.5)
  assert.equal(insufficient.kind, 'insufficient')
  assert.deepEqual(insufficient.shortages, [{ level: 'warmup', required: 6, available: 5 }])
})

test('热门歌曲火焰标记公开可见且仅本人登录后可操作', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const cloud = readFileSync(cloudAdapterUrl, 'utf8')

  assert.match(station, /const canManageFeaturedSongs = isFeaturedSongManager\(songRecordSession\?\.alias\)/)
  assert.match(station, /aria-label=\{featured \? `取消\$\{song\.title\}的热门歌曲标记` : `将\$\{song\.title\}设为热门歌曲`\}/)
  assert.match(station, /title="热门歌曲">🔥<\/span>/)
  assert.match(station, /<FeaturedSongControl song=\{song\} \/>\s*<RequestButton song=\{song\} \/>/)
  assert.match(cloud, /export const pullCloudFeaturedSongIds/)
  assert.match(cloud, /export const saveCloudFeaturedSongIds/)
  assert.match(cloud, /action: 'featuredSongs:pull'/)
  assert.match(cloud, /action: 'featuredSongs:set'/)
})

test('识曲歌库公开加载、管理员保存且失败时保留当前选择', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const cloud = readFileSync(cloudAdapterUrl, 'utf8')

  assert.match(cloud, /export const pullCloudQuizAssignments/)
  assert.match(cloud, /export const saveCloudQuizAssignments/)
  assert.match(station, /pullCloudQuizAssignments\(\)/)
  assert.match(station, /saveCloudQuizAssignments\(songRecordSession, next\)/)
  assert.match(station, /识曲歌库尚未同步/)
  assert.doesNotMatch(station, /catch\s*\{[^}]*setQuizAssignments\(previous\)/s)
})

test('歌曲行在热门火焰左侧提供四档采购且访客只看等级', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /const QuizLevelControl = \(\{ song \}: \{ song: Song \}\)/)
  assert.match(station, /选择\$\{song\.title\}的识曲难度/)
  assert.match(station, /QUIZ_LEVELS\.map/)
  assert.match(station, /再次选择可移出歌库/)
  assert.match(station, /<QuizLevelControl song=\{song\} \/>\s*<FeaturedSongControl song=\{song\} \/>/)
})

test('点歌台四宫格下方提供横向识曲歌库总部和四档面板', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /QUIZ LIBRARY/)
  assert.match(station, />识曲歌库</)
  assert.match(station, /sm:col-span-2/)
  assert.match(station, /quizCounts\.total/)
  assert.match(station, /levelSongs\.length/)
  assert.match(station, /flex h-\[22rem\] flex-col/)
  assert.match(station, /min-h-0 flex-1 grid grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2/)
  assert.match(station, /这个档位还没有歌曲/)
  assert.doesNotMatch(station, /从识曲歌库移除/)
})

test('increments cumulative votes without mutating the prior state', async () => {
  const { incrementSongVote } = await loadModule()
  const current = { a: 2 }
  const next = incrementSongVote(current, 'a')

  assert.deepEqual(next, { a: 3 })
  assert.deepEqual(current, { a: 2 })
})

test('ranks requested songs by count and keeps catalog order for ties', async () => {
  const { rankSongsByVotes } = await loadModule()
  assert.deepEqual(
    rankSongsByVotes(songs, { a: 2, b: 3, c: 2 }).map((item: { song: { id: string }, count: number }) => [item.song.id, item.count]),
    [['b', 3], ['a', 2], ['c', 2]],
  )
  assert.deepEqual(rankSongsByVotes(songs, {}), [])
})

test('榜单按总榜与歌手曲库数量决定金银铜名次数量', async () => {
  const module = await loadModule() as Record<string, unknown>
  assert.equal(typeof module.getRankingMedalTone, 'function')
  assert.equal(typeof module.getPersonalRankingPodiumSize, 'function')

  const getRankingMedalTone = module.getRankingMedalTone as (index: number, podiumSize: number) => string
  const getPersonalRankingPodiumSize = module.getPersonalRankingPodiumSize as (artistSongCount: number | null) => number
  assert.deepEqual([0, 1, 2, 3].map((index) => getRankingMedalTone(index, 3)), ['gold', 'silver', 'bronze', 'neutral'])
  assert.deepEqual([0, 1, 2].map((index) => getRankingMedalTone(index, 1)), ['gold', 'neutral', 'neutral'])
  assert.equal(getPersonalRankingPodiumSize(null), 3)
  assert.equal(getPersonalRankingPodiumSize(4), 1)
  assert.equal(getPersonalRankingPodiumSize(5), 3)

  const station = readFileSync(stationUrl, 'utf8')
  assert.match(station, /getRankingMedalTone\(index, 3\)/)
  assert.match(station, /getRankingMedalTone\(originalRank - 1, personalRankingPodiumSize\)/)
  assert.match(station, /getPersonalRankingPodiumSize\(personalRankingArtist \? artistSongCount : null\)/)
  assert.match(station, /gold: 'bg-amber-300/)
  assert.match(station, /silver: 'bg-slate-200/)
  assert.match(station, /bronze: 'bg-orange-700/)
})

test('loads only valid cumulative counts from the current storage schema', async () => {
  const { loadVoteCounts, VOTE_STORAGE_KEY } = await loadModule()
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }

  values.set(VOTE_STORAGE_KEY, JSON.stringify({ version: 1, counts: { a: 4, b: -1, c: 1.5, ghost: 99 } }))
  assert.deepEqual(loadVoteCounts(storage, songs.map((song) => song.id)), { a: 4 })

  values.set(VOTE_STORAGE_KEY, JSON.stringify({ version: 2, counts: { a: 10 } }))
  assert.deepEqual(loadVoteCounts(storage, songs.map((song) => song.id)), {})

  values.set(VOTE_STORAGE_KEY, '{bad json')
  assert.deepEqual(loadVoteCounts(storage, songs.map((song) => song.id)), {})
})

test('saves counts in a versioned local storage envelope', async () => {
  const { saveVoteCounts, VOTE_STORAGE_KEY } = await loadModule()
  let saved = ''
  saveVoteCounts({ setItem: (_key: string, value: string) => { saved = value } }, { a: 7 })
  assert.equal(saved, JSON.stringify({ version: 1, counts: { a: 7 } }))
  assert.equal(typeof VOTE_STORAGE_KEY, 'string')
})

test('station exposes requests and rankings without playback controls', () => {
  assert.ok(existsSync(stationUrl), 'song request station must exist')
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /热门歌曲/)
  assert.match(source, /点歌榜/)
  assert.match(source, /个人练习榜/)
  assert.match(source, /aria-label="切换到个人练习榜"/)
  assert.match(source, /rankSongsByPracticeMatch/)
  assert.match(source, /搜索歌名或歌手/)
  assert.match(source, /: '点歌'/)
  assert.match(source, /getSongSubtitle\(song\)/)
  assert.doesNotMatch(source, new RegExp(['点', '这首'].join('')))
  assert.match(source, /<div className="grid gap-3 sm:grid-cols-2">\s*\{songs\.map/)
  assert.match(source, /grid gap-3 sm:grid-cols-2 lg:grid-cols-4\"\>\{paginatedArtistGroups/)
  assert.match(source, /新增歌手/)
  assert.match(source, /删除歌手/)
  assert.match(source, /新增歌曲/)
  assert.match(source, /删除歌曲/)
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_22rem\]/)
  assert.doesNotMatch(source, /<audio|new Audio|\.play\(|\.pause\(/)
})

test('个人练习榜超过八首时滚动并支持从右侧搜索切换总榜和正式歌手榜', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /const PERSONAL_RANKING_SCROLL_THRESHOLD = 8/)
  assert.match(source, /const \[personalRankingArtist, setPersonalRankingArtist\] = useState<string \| null>\(null\)/)
  assert.match(source, /const \[rankingArtistQuery, setRankingArtistQuery\] = useState\(''\)/)
  assert.match(source, /const visiblePersonalRanking = useMemo/)
  assert.match(source, /paginatedPersonalRanking\.items\.length > PERSONAL_RANKING_SCROLL_THRESHOLD/)
  assert.match(source, /max-h-\[42rem\] overflow-y-auto/)
  assert.match(source, /aria-label="个人练习榜歌手筛选"/)
  assert.match(source, /placeholder="搜索歌手或歌曲"/)
  assert.match(source, />总榜</)
  assert.match(source, /groupSongsByArtist\(catalogSongs\)\.filter\(\(\{ songs \}\) => songs\.length >= 2\)/)
  assert.match(source, /className="mt-3 grid max-h-\[34rem\] grid-cols-2 gap-2 overflow-y-auto/)
  assert.match(source, /setPersonalRankingArtist\(artist\)/)
})

test('个人练习榜每页五十首并正确处理分页边界', async () => {
  const module = await loadModule()
  const paginateRankingItems = module.paginateRankingItems as undefined | (<T>(items: T[], page: number, pageSize: number) => {
    items: T[]; page: number; pageCount: number; total: number;
  })

  assert.equal(typeof paginateRankingItems, 'function')
  if (!paginateRankingItems) return
  const items = Array.from({ length: 101 }, (_, index) => index + 1)
  assert.deepEqual(paginateRankingItems(items.slice(0, 49), 1, 50), { items: items.slice(0, 49), page: 1, pageCount: 1, total: 49 })
  assert.deepEqual(paginateRankingItems(items.slice(0, 50), 1, 50), { items: items.slice(0, 50), page: 1, pageCount: 1, total: 50 })
  assert.deepEqual(paginateRankingItems(items.slice(0, 51), 2, 50), { items: [51], page: 2, pageCount: 2, total: 51 })
  assert.deepEqual(paginateRankingItems(items, 99, 50), { items: [101], page: 3, pageCount: 3, total: 101 })
})

test('个人练习榜支持保留真实名次的倒序展示', async () => {
  const module = await loadModule()
  const paginateRankingItems = module.paginateRankingItems as <T>(items: T[], page: number, pageSize: number) => { items: T[] }
  const orderPersonalRankingItems = module.orderPersonalRankingItems as undefined | (<T extends object>(items: T[], mode: 'normal' | 'reverse' | 'random', random?: () => number) => Array<T & { originalRank: number }>)
  const togglePersonalRankingReverse = module.togglePersonalRankingReverse as undefined | ((mode: 'normal' | 'reverse' | 'random') => 'normal' | 'reverse' | 'random')
  const togglePersonalRankingRandom = module.togglePersonalRankingRandom as undefined | ((mode: 'normal' | 'reverse' | 'random') => 'normal' | 'reverse' | 'random')
  assert.equal(typeof orderPersonalRankingItems, 'function')
  assert.equal(typeof togglePersonalRankingReverse, 'function')
  assert.equal(typeof togglePersonalRankingRandom, 'function')
  if (!orderPersonalRankingItems || !togglePersonalRankingReverse || !togglePersonalRankingRandom) return

  const items = Array.from({ length: 51 }, (_, index) => ({ id: index + 1 }))
  const reversed = orderPersonalRankingItems(items, 'reverse')
  assert.deepEqual(reversed.slice(0, 3).map(({ id, originalRank }) => [id, originalRank]), [[51, 51], [50, 50], [49, 49]])
  assert.deepEqual(paginateRankingItems(reversed, 2, 50).items.map(({ originalRank }) => originalRank), [1])
  const randomized = orderPersonalRankingItems(items, 'random', () => 0)
  assert.deepEqual(randomized.slice(0, 3).map(({ originalRank }) => originalRank), [1, 2, 3])
  assert.deepEqual([...paginateRankingItems(randomized, 1, 50).items, ...paginateRankingItems(randomized, 2, 50).items], randomized)
  assert.equal(togglePersonalRankingReverse('normal'), 'reverse')
  assert.equal(togglePersonalRankingReverse('reverse'), 'normal')
  assert.equal(togglePersonalRankingReverse('random'), 'reverse')
  assert.equal(togglePersonalRankingRandom('normal'), 'random')
  assert.equal(togglePersonalRankingRandom('reverse'), 'random')
  assert.equal(togglePersonalRankingRandom('random'), 'normal')

  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /const PERSONAL_RANKING_PAGE_SIZE = 50/)
  assert.match(source, /const \[personalRankingMode, setPersonalRankingMode\] = useState<RankingDisplayMode>\('normal'\)/)
  assert.match(source, /orderPersonalRankingItems\(base, personalRankingMode\)/)
  assert.match(source, /paginateRankingItems\(visiblePersonalRanking, personalRankingPage, PERSONAL_RANKING_PAGE_SIZE\)/)
  assert.match(source, /paginatedPersonalRanking\.items\.map/)
  assert.match(source, /key=\{`practice-ranking-\$\{personalRankingMode\}-\$\{paginatedPersonalRanking\.page\}`\}/)
  assert.match(source, /getRankingMedalTone\(originalRank - 1, personalRankingPodiumSize\)/)
  assert.match(source, /aria-label="上一页练习榜"/)
  assert.match(source, /aria-label="下一页练习榜"/)
  assert.match(source, /togglePersonalRankingReverse/)
  assert.match(source, /togglePersonalRankingRandom/)
  assert.match(source, /grid grid-cols-2 gap-2[\s\S]*placeholder="搜索歌手或歌曲"[\s\S]*aria-label="切换练习榜正倒序"/)
})

test('点歌榜和个人练习榜保持一首歌占据一行', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /ranking\.length \? <ol className="space-y-3">/)
  assert.match(source, /className=\{`space-y-3 \$\{paginatedPersonalRanking\.items\.length/)
  assert.doesNotMatch(source, /grid grid-cols-1 gap-3 xl:grid-cols-2/)
})

test('个人练习榜在平均匹配值旁显示对应品质', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /getMatchQuality/)
  assert.match(source, /const quality = getMatchQuality\(Math\.round\(score\)\)/)
  assert.match(source, /practice-quality \$\{quality\?\.tone \?\? 'white'\}/)
  assert.match(source, /quality\?\.label \?\? '—'/)
})

test('歌手页支持持久排序及上传头像后继续微调', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /const \[artistOrderMode, setArtistOrderMode\] = useState\(false\)/)
  assert.match(source, /调整排序/)
  assert.match(source, /moveCatalogArtist\(catalog, artist, targetArtist\)/)
  assert.match(source, /前移/)
  assert.match(source, /后移/)
  assert.match(source, /CUSTOM_ARTIST_AVATARS_KEY/)
  assert.match(source, /resizeArtistAvatar/)
  assert.match(source, /canvas\.toDataURL\('image\/webp'/)
  assert.match(source, /const scale = Math\.min\(1, maxSize \/ Math\.max\(image\.naturalWidth, image\.naturalHeight\)\)/)
  assert.doesNotMatch(source, /sourceSize = Math\.min/)
  assert.match(source, /accept="image\/\*"/)
  assert.match(source, /customArtistAvatars\[artist\]/)
  assert.match(source, /onUpload/)
  assert.match(source, /avatarAdjustMode \? setAdjustingArtist\(artist\)/)
  assert.match(source, /pullArtistSettings/)
  assert.match(source, /pushArtistSettings/)
  assert.match(source, /artistSettingsInitializedRef/)
  assert.match(source, /resolveArtistSettingsPull/)
  assert.match(source, /rebaseArtistSettingsDraft/)
  assert.match(source, /error instanceof Error && error\.message === 'CONFLICT'/)
  assert.doesNotMatch(source, /showSyncMessage\('云端歌手设置已有更新，本地修改已保留。'\)/)
  assert.match(source, /runArtistSettingsPush/)
  assert.match(source, /ensureArtistSettingsRetryDraft/)
  assert.match(source, /window\.addEventListener\('online', retryArtistSettingsPush\)/)
  assert.match(source, /window\.addEventListener\('focus', retryArtistSettingsPush\)/)
  assert.match(source, /if \(artistOrderMode\) syncCurrentArtistSettings\(\)/)
  assert.match(source, /if \(avatarAdjustMode\) syncCurrentArtistSettings\(\)/)
})

test('歌手列表每页限制二十四人并在排序时展示全部', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /const ARTISTS_PER_PAGE = 24/)
  assert.match(source, /const \[artistPage, setArtistPage\] = useState\(1\)/)
  assert.match(source, /artistOrderMode\s*\?\s*artistGroups\s*:\s*artistGroups\.slice/)
  assert.match(source, /setArtistPage\(1\)/)
  assert.match(source, /aria-label="上一页歌手"/)
  assert.match(source, /aria-label="下一页歌手"/)
  assert.match(source, /共 \{artistGroups\.length\} 位歌手/)
  assert.match(source, /artistOrderMode \? '' : 'lg:min-h-\[34\.5rem\]'/)
  assert.match(source, /grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-4/)
})

test('调整排序时可拖拽歌手并插入任意位置', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /GripVertical/)
  assert.match(source, /const \[draggedArtist, setDraggedArtist\] = useState<string \| null>\(null\)/)
  assert.match(source, /const \[artistDropTarget, setArtistDropTarget\]/)
  assert.match(source, /draggable=\{artistOrderMode\}/)
  assert.match(source, /onDragStart=\{\(event\) => handleArtistDragStart\(event, artist\)\}/)
  assert.match(source, /onDragOver=\{\(event\) => handleArtistDragOver\(event, artist\)\}/)
  assert.match(source, /onDrop=\{\(event\) => handleArtistDrop\(event, artist\)\}/)
  assert.match(source, /insertCatalogArtist\(catalog, sourceArtist, targetArtist, placement\)/)
  assert.match(source, /拖拽到任意位置/)
})

test('groups songs by singer while preserving catalog order', async () => {
  const { groupSongsByArtist } = await loadRoadshowModule()
  const groups = groupSongsByArtist(songs)

  assert.deepEqual(groups.map((group: { artist: string, songs: Array<{ id: string }> }) => [group.artist, group.songs.map((song) => song.id)]), [
    ['周杰伦', ['a', 'c']],
    ['Coldplay', ['b']],
  ])
})

test('识曲歌库歌曲只加入日期最新的路演听歌识曲并自动去重', async () => {
  const { prepareLatestRoadshowRecognitionSong } = await loadRoadshowModule()
  const records = [
    {
      id: 'older', title: '旧路演', date: '2026-08-20', updatedAt: '2026-08-20T12:00:00.000Z',
      performanceSongs: [], recognitionSongs: [],
    },
    {
      id: 'latest', title: '最新路演', date: '2026-08-28', updatedAt: '2026-08-28T12:00:00.000Z',
      performanceSongs: [], recognitionSongs: [],
    },
  ]
  const first = prepareLatestRoadshowRecognitionSong(records, songs[0])
  assert.equal(first.kind, 'updated')
  assert.equal(first.record.id, 'latest')
  assert.deepEqual(first.record.recognitionSongs.map((song: { catalogId?: string }) => song.catalogId), ['a'])
  assert.deepEqual(records[1].recognitionSongs, [])
  assert.equal(prepareLatestRoadshowRecognitionSong([first.record], songs[0]).kind, 'duplicate')
  assert.deepEqual(prepareLatestRoadshowRecognitionSong([], songs[0]), { kind: 'missing' })
})

test('批量识曲选歌写入最新路演并能汇总所有往期已用歌曲', async () => {
  const { collectUsedRecognitionSongIds, prepareLatestRoadshowRecognitionSongs } = await loadRoadshowModule()
  const records = [
    {
      id: 'older', title: '旧路演', date: '2026-08-20', updatedAt: '2026-08-20T12:00:00.000Z', performanceSongs: [],
      recognitionSongs: [{ id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }],
    },
    {
      id: 'latest', title: '最新路演', date: '2026-08-28', updatedAt: '2026-08-28T12:00:00.000Z', performanceSongs: [],
      recognitionSongs: [{ id: 'catalog:b', catalogId: 'b', title: 'Yellow', artist: 'Coldplay', source: 'catalog' }],
    },
  ]
  const additions = [songs[2], { id: 'd', title: '后来', artist: '刘若英', category: '华语', featured: false }]

  assert.deepEqual([...collectUsedRecognitionSongIds(records)].sort(), ['a', 'b'])
  const prepared = prepareLatestRoadshowRecognitionSongs(records, additions)
  assert.equal(prepared.kind, 'updated')
  assert.equal(prepared.record.id, 'latest')
  assert.deepEqual(prepared.record.recognitionSongs.map((song: { catalogId?: string }) => song.catalogId), ['b', 'c', 'd'])
  assert.deepEqual(records[1].recognitionSongs.map((song: { catalogId?: string }) => song.catalogId), ['b'])
  assert.deepEqual(prepareLatestRoadshowRecognitionSongs([], additions), { kind: 'missing' })
})

test('歌曲只加入日期最新的路演歌曲并自动去重', async () => {
  const { prepareLatestRoadshowPerformanceSong } = await loadRoadshowModule()
  const records = [
    {
      id: 'older', title: '旧路演', date: '2026-08-20', updatedAt: '2026-08-20T12:00:00.000Z',
      performanceSongs: [], recognitionSongs: [],
    },
    {
      id: 'latest', title: '最新路演', date: '2026-08-28', updatedAt: '2026-08-28T12:00:00.000Z',
      performanceSongs: [], recognitionSongs: [{ id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }],
    },
  ]

  const first = prepareLatestRoadshowPerformanceSong(records, songs[0])

  assert.equal(first.kind, 'updated')
  assert.equal(first.record.id, 'latest')
  assert.deepEqual(first.record.performanceSongs.map((song: { catalogId?: string }) => song.catalogId), ['a'])
  assert.equal(first.record.recognitionSongs.length, 1)
  assert.deepEqual(records[1].performanceSongs, [])
  assert.equal(prepareLatestRoadshowPerformanceSong([first.record], songs[0]).kind, 'duplicate')
  assert.deepEqual(prepareLatestRoadshowPerformanceSong([], songs[0]), { kind: 'missing' })
})

test('歌曲路演历史只统计路演歌曲并按日期倒序排列', async () => {
  const { findSongRoadshowHistory } = await loadRoadshowModule()
  const records = [
    {
      id: 'first', title: '第一次路演', date: '2026-08-01', updatedAt: '2026-08-01T12:00:00.000Z',
      performanceSongs: [{ id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }], recognitionSongs: [],
    },
    {
      id: 'quiz-only', title: '识曲专场', date: '2026-08-20', updatedAt: '2026-08-20T12:00:00.000Z',
      performanceSongs: [], recognitionSongs: [{ id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }],
    },
    {
      id: 'latest', title: '最近一次路演', date: '2026-08-31', updatedAt: '2026-08-31T12:00:00.000Z',
      performanceSongs: [{ id: 'manual:sunny', title: ' 晴天 ', artist: '周杰伦', source: 'manual' }], recognitionSongs: [],
    },
  ]

  assert.deepEqual(findSongRoadshowHistory(records, songs[0]).map((record: { id: string }) => record.id), ['latest', 'first'])
})

test('歌曲详情路演页展示次数最近日期和参与路演时间轴', () => {
  const detail = readFileSync(songDetailPanelUrl, 'utf8')
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(detail, /findSongRoadshowHistory/)
  assert.match(detail, /参与路演/)
  assert.match(detail, /尚未参与路演/)
  assert.match(detail, /label="路演"/)
  assert.match(detail, /label="最近"/)
  assert.match(detail, /roadshowHistory\.length/)
  assert.match(detail, /<ol className="grid gap-2 sm:grid-cols-2">/)
  assert.doesNotMatch(detail, /index === 0.*最近/)
  assert.match(station, /roadshows=\{roadshowArchives\}/)
})

test('歌手歌曲行使用单一编排弹窗同时承载识曲难度和最新路演', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /prepareLatestRoadshowPerformanceSong/)
  assert.match(station, /最新路演 · 路演歌曲/)
  assert.match(station, /加入“\$\{latestRoadshow\.title\}”/)
  assert.match(station, /已加入最新路演/)
  assert.match(station, /latestRoadshow\?\.performanceSongs\.some/)
  assert.match(station, /max-h-\[calc\(100vh-2rem\)\] overflow-y-auto/)
  assert.match(station, /grid grid-cols-2 gap-1/)
  assert.match(station, /\{level\.label\}\s*<span className="ml-auto tabular-nums text-\[10px\] text-white\/40">\{quizCounts\[level\.id\]\}<\/span>/)
  assert.match(station, /<QuizLevelControl song=\{song\} \/><FeaturedSongControl song=\{song\} \/><RequestButton song=\{song\} \/>/)
})

test('歌曲详情页沿用管理员权限并可将当前歌曲编排进全站听歌识曲', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const panel = readFileSync(songDetailPanelUrl, 'utf8')

  assert.match(station, /quizLevel=\{quizAssignments\[selectedSong\.id\]\}/)
  assert.match(station, /quizCounts=\{quizCounts\}/)
  assert.match(station, /canManageQuiz=\{canManageFeaturedSongs\}/)
  assert.match(station, /onQuizLevelChange=\{\(level\) => void updateQuizLevel\(selectedSong, level\)\}/)
  assert.match(panel, /QUIZ_LEVELS\.map\(\(level\) =>/)
  assert.match(panel, /听歌识曲/)
  assert.match(panel, /quizCounts\[level\.id\]/)
  assert.match(panel, /onQuizLevelChange\(level\.id\)/)
  assert.match(panel, /再次点击当前等级可移出/)
  assert.match(panel, /grid min-w-64 grid-cols-3[\s\S]*data-detail-quiz-trigger[\s\S]*<Stat label="练习"/)
  assert.doesNotMatch(panel, /data-journal-toolbar[\s\S]*data-detail-quiz-trigger/)
  assert.match(panel, /data-detail-quiz-popover/)
  assert.match(panel, /data-detail-quiz-trigger[\s\S]*rounded-2xl[\s\S]*aria-label="听歌识曲等级"/)
  assert.doesNotMatch(panel, /data-quiz-level-editor/)
})

test('路演听歌识曲按识曲歌库四档分组且旧歌曲默认归入常规', async () => {
  const { groupRoadshowRecognitionSongs } = await loadRoadshowModule()
  const recognitionSongs = [
    { id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' },
    { id: 'catalog:b', catalogId: 'b', title: 'Yellow', artist: 'Coldplay', source: 'catalog' },
    { id: 'manual:old', title: '旧题目', artist: '未知', source: 'manual' },
  ]

  const grouped = groupRoadshowRecognitionSongs(recognitionSongs, { a: 'warmup', b: 'hell' })

  assert.deepEqual(grouped.warmup.map((song: { id: string }) => song.id), ['catalog:a'])
  assert.deepEqual(grouped.standard.map((song: { id: string }) => song.id), ['manual:old'])
  assert.deepEqual(grouped.hard, [])
  assert.deepEqual(grouped.hell.map((song: { id: string }) => song.id), ['catalog:b'])
})

test('路演听歌识曲每栏五首并支持独立页码与越界回落', async () => {
  const module = await loadRoadshowModule()
  const paginateRoadshowSongs = module.paginateRoadshowSongs as undefined | (<T>(items: T[], page: number) => {
    items: T[]; page: number; pageCount: number; total: number
  })

  assert.equal(module.ROADSHOW_QUIZ_PAGE_SIZE, 5)
  assert.equal(typeof paginateRoadshowSongs, 'function')
  if (!paginateRoadshowSongs) return

  const songs = Array.from({ length: 11 }, (_, index) => index + 1)
  assert.deepEqual(paginateRoadshowSongs(songs, 1), { items: [1, 2, 3, 4, 5], page: 1, pageCount: 3, total: 11 })
  assert.deepEqual(paginateRoadshowSongs(songs, 2), { items: [6, 7, 8, 9, 10], page: 2, pageCount: 3, total: 11 })
  assert.deepEqual(paginateRoadshowSongs(songs, 99), { items: [11], page: 3, pageCount: 3, total: 11 })

  const pages = { warmup: 2, standard: 1 }
  assert.equal(paginateRoadshowSongs(songs, pages.warmup).page, 2)
  assert.equal(paginateRoadshowSongs(songs, pages.standard).page, 1)
})

test('路演听歌识曲分页只切换当前等级且选择状态独立保留', () => {
  const source = readFileSync(roadshowPanelUrl, 'utf8')
  const recognitionEditor = source.slice(source.indexOf('const RecognitionSongListEditor'))

  assert.match(recognitionEditor, /quizPages/)
  assert.match(recognitionEditor, /setQuizPages\(\(current\) => \(\{ \.\.\.current, \[level\.id\]:/)
  assert.match(recognitionEditor, /paginateRoadshowSongs\(groups\[level\.id\], quizPages\[level\.id\]\)/)
  assert.match(recognitionEditor, /paginated\.items\.map/)
  assert.doesNotMatch(recognitionEditor, /paginated\.pageCount > 1/)
  assert.match(recognitionEditor, /<footer className=/)
  assert.match(recognitionEditor, /\{paginated\.page\} \/ \{paginated\.pageCount\}/)
  assert.match(recognitionEditor, /selectedSongIds\.includes\(song\.id\)/)
})

test('路演识曲作答支持同轮改判且公开榜单数据只接收有效统计', async () => {
  const { createRecognitionAttempt, parsePublicQuizRanking, upsertRecognitionAttempt } = await loadRoadshowModule()
  const record = {
    id: 'roadshow-1', title: '路演', date: '2026-09-01', updatedAt: '2026-09-01T12:00:00.000Z',
    performanceSongs: [], recognitionSongs: [], recognitionAttempts: [],
  }
  const song = { id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }
  const correct = createRecognitionAttempt(song, true, 'attempt-1', '2026-09-01T12:00:00.000Z')
  const first = upsertRecognitionAttempt(record, correct)
  const changed = upsertRecognitionAttempt(first, { ...correct, correct: false })

  assert.equal(first.recognitionAttempts.length, 1)
  assert.equal(changed.recognitionAttempts.length, 1)
  assert.equal(changed.recognitionAttempts[0].correct, false)
  assert.deepEqual(parsePublicQuizRanking([
    { songId: 'a', songTitle: '晴天', songArtist: '周杰伦', answerCount: 3, correctCount: 2, accuracy: 66.7 },
    { songId: '', songTitle: '坏数据', songArtist: '', answerCount: 0, correctCount: 0, accuracy: 999 },
  ]), [{ songId: 'a', songTitle: '晴天', songArtist: '周杰伦', answerCount: 3, correctCount: 2, accuracy: 66.7 }])
})

test('路演识曲面板以参与模式选择四首并在固定判定区记录对错', () => {
  const source = readFileSync(roadshowPanelUrl, 'utf8')
  const recognitionEditor = source.slice(source.indexOf('const RecognitionSongListEditor'))

  assert.doesNotMatch(recognitionEditor, /<X className=/)
  assert.doesNotMatch(recognitionEditor, /\{songs\.length\} 首/)
  assert.match(recognitionEditor, />参与</)
  assert.match(recognitionEditor, /selectedSongIds\.length === 4/)
  assert.match(recognitionEditor, /aria-label=\{`将\$\{song\.title\}标记为答错`\}/)
  assert.match(recognitionEditor, /aria-label=\{`将\$\{song\.title\}标记为答对`\}/)
  assert.match(recognitionEditor, /❌/)
  assert.match(recognitionEditor, /✅/)
  assert.match(recognitionEditor, /下一位玩家/)
  assert.match(source, /onRecordAttempt/)
})

test('排行榜增加猜歌榜图标并展示答题数和正确率', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const cloud = readFileSync(cloudAdapterUrl, 'utf8')

  assert.match(station, /type RankingView = 'requests' \| 'personal' \| 'quiz'/)
  assert.match(station, /aria-label="切换到猜歌榜"/)
  assert.match(station, /pullPublicQuizRanking/)
  assert.match(station, /答题 \{entry\.answerCount\} 次/)
  assert.match(station, /\{entry\.accuracy\}<small[^>]*>% 正确率/)
  assert.match(cloud, /action: 'roadshows:publicQuizRanking'/)
})

test('识曲歌库歌曲卡提供加入最新路演听歌识曲按钮', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /prepareLatestRoadshowRecognitionSong/)
  assert.match(station, /pullRoadshows\(songRecordSession\)/)
  assert.match(station, /saveRoadshow\(songRecordSession, prepared\.record\)/)
  assert.match(station, /将\$\{song\.title\}加入最新路演听歌识曲/)
  assert.match(station, /已加入.*听歌识曲/)
})

test('听歌识曲右上角提供一键选歌并标记所有往期已用歌曲', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /一键选歌/)
  assert.match(station, /简单6 · 常规10 · 较难10 · 很难4/)
  assert.match(station, /selectQuizSongsForRoadshow/)
  assert.match(station, /collectUsedRecognitionSongIds/)
  assert.match(station, /prepareLatestRoadshowRecognitionSongs/)
  assert.match(station, /usedRecognitionSongIds\.has\(song\.id\)/)
  assert.match(station, />已用</)
})

test('finds prior roadshows containing the same catalog or manual song', async () => {
  const { findSongAppearances } = await loadRoadshowModule()
  const records = [
    {
      id: 'first', title: '第一次路演', date: '2026-08-01', updatedAt: '2026-08-01T00:00:00.000Z',
      performanceSongs: [{ id: 'catalog:a', catalogId: 'a', title: '晴天', artist: '周杰伦', source: 'catalog' }],
      recognitionSongs: [{ id: 'manual:yellow', title: ' Yellow ', artist: 'coldplay', source: 'manual' }],
    },
    {
      id: 'second', title: '第二次路演', date: '2026-08-10', updatedAt: '2026-08-10T00:00:00.000Z',
      performanceSongs: [], recognitionSongs: [],
    },
  ]

  assert.deepEqual(findSongAppearances(records, { catalogId: 'a', title: '晴天', artist: '周杰伦' }), ['第一次路演'])
  assert.deepEqual(findSongAppearances(records, { title: 'yellow', artist: 'Coldplay' }), ['第一次路演'])
  assert.deepEqual(findSongAppearances(records, { title: '后来', artist: '刘若英' }), [])
})

test('loads only valid cached roadshow records', async () => {
  const { parseRoadshowCache } = await loadRoadshowModule()
  const valid = [{
    id: 'r1', title: '第一次路演', date: '2026-08-01', updatedAt: '2026-08-01T00:00:00.000Z',
    performanceSongs: [], recognitionSongs: [],
  }]

  assert.deepEqual(parseRoadshowCache(JSON.stringify({ version: 1, records: valid })), valid)
  assert.deepEqual(parseRoadshowCache(JSON.stringify({ version: 2, records: valid })), [])
  assert.deepEqual(parseRoadshowCache('{bad json'), [])
})

test('station home is a four-direction guide and details are separate', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /const HUB_DIRECTIONS/)
  assert.match(source, /id: 'ranking'.*label: '排行榜'/s)
  assert.match(source, /id: 'artists'.*label: '歌手'/s)
  assert.match(source, /id: 'roadshows'.*label: '私人记录'/s)
  assert.match(source, /id: 'playlists'.*label: '热门歌曲'.*eyebrow: 'HOT SONGS'.*description: '看歌名化作彩色弹幕穿过星空'/s)
  assert.match(source, /activeSection === null/)
  assert.doesNotMatch(source, /id: 'languages'/)
})

test('热门歌曲以彩色描边弹幕从右向左展示且只显示歌名', () => {
  assert.ok(existsSync(popularSongBarrageUrl), 'popular song barrage component must exist')
  const station = readFileSync(stationUrl, 'utf8')
  const barrage = readFileSync(popularSongBarrageUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(station, /<PopularSongBarrage songs=\{barrageSongs\}/)
  assert.match(barrage, /aria-label="热门歌曲弹幕"/)
  assert.match(barrage, /message: song\.title/)
  assert.doesNotMatch(barrage, /song\.artist|hotComment|getSongSubtitle/)
  assert.match(barrage, /<MessageBarrage/)
  assert.match(barrage, /simple/)
  assert.match(css, /@keyframes barrage-travel[\s\S]*translate3d\(-100%, -50%, 0\)/)
  assert.match(css, /\.barrage-lane[\s\S]*animation: barrage-travel/)
})

test('热门歌曲使用浅色描边且背景没有紫色光晕', () => {
  const barrage = readFileSync(popularSongBarrageUrl, 'utf8')
  const messageBarrage = readFileSync(messageBarrageUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(barrage, /const COLORS = \['#fca5a5', '#fde68a', '#99f6e4', '#bae6fd', '#ddd6fe', '#fbcfe8', '#bbf7d0'\]/)
  assert.match(messageBarrage, /boxShadow: `0 0 12px \$\{color\}1f, inset 0 0 10px \$\{color\}0a`/)
  assert.doesNotMatch(barrage, /popular-song-board__glow/)
  assert.doesNotMatch(css, /\.popular-song-board__glow/)
  assert.doesNotMatch(css, /rgba\((?:91, 33, 182|124, 58, 237)/)
})

test('热门歌曲透出全站动态星辰且弹幕仍位于星空上方', () => {
  const app = readFileSync(appUrl, 'utf8')
  const station = readFileSync(stationUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')
  const immersiveBoard = css.match(/\.popular-song-board--immersive\s*\{[^}]*\}/s)?.[0] ?? ''

  assert.match(app, /<StarryCanvas \/>/)
  assert.match(station, /popularImmersive \? 'h-screen overflow-hidden bg-transparent'/)
  assert.match(station, /data-popular-immersive className="fixed inset-0 z-10 overflow-hidden bg-transparent"/)
  assert.match(immersiveBoard, /background:\s*rgba\(2, 2, 7, \.22\)/)
  assert.doesNotMatch(immersiveBoard, /#020207/)
})

test('热门歌曲页拆除搜索与完整曲库并让弹幕覆盖整个可视区域', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const barrage = readFileSync(popularSongBarrageUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(station, /const popularImmersive = activeSection === 'playlists' && !selectedSong/)
  assert.match(station, /data-popular-immersive/)
  assert.match(station, /<PopularSongBarrage[\s\S]*immersive/)
  assert.doesNotMatch(station, /完整曲库/)
  assert.doesNotMatch(station, /songCategories|visibleSongs/)
  assert.match(station, /if \(activeSection === 'playlists'\) return;/)
  assert.match(barrage, /immersive\?: boolean/)
  assert.match(barrage, /popular-song-board--immersive/)
  assert.match(css, /\.popular-song-board--immersive\s*\{[^}]*position: absolute;[^}]*inset: 0;[^}]*height: 100%;[^}]*border-radius: 0;/s)
})

test('歌曲页猫咪助手复用检索歌曲展示与弹幕功能但不包含小工具', () => {
  const station = readFileSync(stationUrl, 'utf8')
  const barrage = readFileSync(popularSongBarrageUrl, 'utf8')
  const messageBarrage = readFileSync(messageBarrageUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(station, /aria-label="打开歌曲助手"/)
  assert.match(station, /🐱/)
  assert.match(station, /\{popularImmersive && !songAssistantOpen && \(/)
  assert.doesNotMatch(station, /\{!songAssistantOpen && \(/)
  assert.match(station, /aria-label="歌曲助手栏"/)
  assert.match(station, /🔎 检索/)
  assert.match(station, /搜索歌名或歌手/)
  assert.match(station, /⭐ 歌曲展示/)
  assert.match(station, /随机部分（60首，刷新重置）/)
  assert.match(station, /完全展示（全部歌曲）/)
  assert.match(station, /type SongDisplayMode = 'random' \| 'full'/)
  assert.match(station, /const featured = new Set\(featuredSongIds\)/)
  assert.match(station, /return catalogSongs\.filter\(\(song\) => featured\.has\(song\.id\)\)/)
  assert.match(station, /const shuffled = \[\.\.\.providedSongs\]/)
  assert.match(station, /return shuffled\.slice\(0, 60\)/)
  assert.match(station, /const barrageSongs = useMemo/)
  assert.match(station, /return providedSongs\.filter/)
  assert.match(station, /songDisplayMode === 'full' \? providedSongs : randomSongs/)
  assert.doesNotMatch(station, /const shuffled = \[\.\.\.catalogSongs\]/)
  assert.match(station, /<PopularSongBarrage songs=\{barrageSongs\}/)
  assert.doesNotMatch(station, /星星展示|30颗|全部星星|小工具/)
  assert.match(station, /💬 弹幕/)
  assert.match(station, /const barrageMode = barragePreferences\.immersive/)
  assert.match(station, /const intimateMode = barragePreferences\.intimate/)
  assert.match(station, /const fillMode = barragePreferences\.fill/)
  assert.match(station, /aria-label="弹幕模式"/)
  assert.match(station, /只保留星空与歌曲/)
  assert.match(station, /aria-label="亲密模式"/)
  assert.match(station, /弹幕横纵间距减半/)
  assert.match(station, /aria-label="填充模式"/)
  assert.match(station, /循环补齐弹幕，减少屏幕空白/)
  assert.doesNotMatch(station, /暂停弹幕|继续弹幕|慢速|标准|快速/)
  assert.match(station, /useState\(createInitialSongBarragePreferences\)/)
  assert.doesNotMatch(station, /immersive: true/)
  assert.doesNotMatch(station, /<PopularSongBarrage[^>]*active=/)
  assert.match(station, /\{!barrageMode && \(\s*<header/)
  assert.match(station, /\{!barrageMode && \(\s*<p className="pointer-events-none fixed bottom-5/)
  assert.doesNotMatch(barrage, /active: boolean|popular-song-stage--paused/)
  assert.match(barrage, /intimate: boolean/)
  assert.match(barrage, /fill: boolean/)
  assert.doesNotMatch(barrage, /\[\.\.\.songs, \.\.\.songs\]/)
  assert.match(barrage, /<MessageBarrage[\s\S]*intimate=\{intimate\}[\s\S]*fill=\{fill\}/)
  assert.match(messageBarrage, /getBarrageLayout\(intimate\)/)
  assert.match(messageBarrage, /getSafeBarrageLaneCount/)
  assert.match(messageBarrage, /getBarrageFillRepeatCount/)
  assert.match(messageBarrage, /className="barrage-lane barrage-lane--fill"/)
  assert.match(messageBarrage, /className="barrage-fill-probe"/)
  assert.match(messageBarrage, /Array\.from\(\{ length: 2 \}/)
  assert.match(css, /@keyframes barrage-fill-travel[\s\S]*translate3d\(-50%, -50%, 0\)/)
})

test('歌曲助手默认完全展示并开启填充模式', () => {
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(station, /const createInitialSongBarragePreferences = \(\) => \(\{[\s\S]*fill: true/)
  assert.match(station, /useState\(createInitialSongBarragePreferences\)/)
  assert.match(station, /useState<SongDisplayMode>\('full'\)/)
})

test('歌手卡片按既定顺序使用人物照片并保留自定义歌手兜底图标', () => {
  const source = readFileSync(stationUrl, 'utf8')
  const avatars = [
    'jay-chou.png', 'jj-lin.png', 'stefanie-sun.png', 'gem.png',
    'joker-xue.png', 'silence-wang.png', 'fish-leong.png', 'david-tao.png',
    'wang-leehom.png', 'vae.png', 'eason-chan.png', 'zheng-runze.png',
  ]

  assert.match(source, /const ARTIST_AVATARS/)
  assert.match(source, /const artistAvatarUrl = \(fileName: string\) => `\$\{import\.meta\.env\.BASE_URL\}images\/song-request\/artists\/\$\{fileName\}`/)
  for (const avatar of avatars) assert.match(source, new RegExp(`artistAvatarUrl\\('${avatar}'\\)`))
  assert.doesNotMatch(source, /src:\s*['"`]\/images\/song-request\/artists\//)
  assert.match(source, /<img[\s\S]*src=\{avatar\.src\}/)
  assert.match(source, /object-cover/)
  assert.match(source, /objectPosition: `\$\{avatarStyle\.x\}% \$\{avatarStyle\.y\}%`/)
  assert.match(source, /transform: `scale\(\$\{avatarStyle\.scale\}\) rotate/)
  assert.match(source, /transformOrigin: `\$\{avatarStyle\.x\}% \$\{avatarStyle\.y\}%`/)
  assert.match(source, /avatar && avatarStyle \? \(/)
  assert.match(source, /: <Mic2/)
})

test('歌手页将仅有一首歌的歌手归入一人一曲且保留歌曲数据', async () => {
  const source = readFileSync(stationUrl, 'utf8')
  const { SONGS } = await import(catalogModuleUrl.href)

  assert.match(source, /type ArtistLanguageFilter = 'chinese' \| 'foreign' \| 'single'/)
  assert.match(source, /const \[artistLanguageFilter, setArtistLanguageFilter\] = useState<ArtistLanguageFilter>\('chinese'\)/)
  assert.match(source, /const ARTIST_LANGUAGE_FILTERS/)
  assert.match(source, /华语歌手/)
  assert.match(source, /外语歌手/)
  assert.match(source, /一人一曲/)
  assert.match(source, /const singleSongArtist = songs\.length === 1;/)
  assert.match(source, /artistLanguageFilter === 'single' \? singleSongArtist/)
  assert.match(source, /songs\.length >= 2/)
  assert.doesNotMatch(source, /value: 'all', label: '全部'/)
  assert.match(source, /aria-label="歌手语种筛选"/)
  assert.ok(SONGS.some((song: { artist: string, title: string }) => song.artist === 'Sweety' && song.title === '樱花草'))
})

test('歌手头像支持本机手动微调和重置', () => {
  const source = readFileSync(stationUrl, 'utf8')

  assert.match(source, /ARTIST_AVATAR_ADJUSTMENTS_KEY/)
  assert.match(source, /调整头像/)
  assert.match(source, /左右/)
  assert.match(source, /上下/)
  assert.match(source, /缩放/)
  assert.match(source, /旋转/)
  assert.match(source, /type="range"/)
  assert.match(source, /localStorage\.setItem/)
  assert.match(source, /重置/)
  assert.match(source, /rotate\(\$\{avatarStyle\.rotation\}deg\)/)
})

test('roadshow editor removes both add forms and shows recognition songs in four levels', () => {
  assert.ok(existsSync(roadshowPanelUrl), 'roadshow panel must exist')
  const source = readFileSync(roadshowPanelUrl, 'utf8')
  const levels = readFileSync(songQuizLibraryUrl, 'utf8')

  assert.match(source, /路演歌曲/)
  assert.match(source, /本次准备演唱的歌曲/)
  assert.match(source, /听歌识曲/)
  assert.match(source, /互动游戏准备的题目歌曲/)
  assert.doesNotMatch(source, /从曲库添加/)
  assert.doesNotMatch(source, /手动添加曲库外歌曲/)
  assert.match(source, /groupRoadshowRecognitionSongs/)
  assert.match(source, /QUIZ_LEVELS\.map/)
  assert.match(levels, /简单/)
  assert.match(levels, /常规/)
  assert.match(levels, /较难/)
  assert.match(levels, /很难/)
  assert.match(source, /锁定档案/)
})

test('路演基本信息四项同排并支持可选地点和天气', () => {
  const source = readFileSync(roadshowPanelUrl, 'utf8')

  assert.match(source, /grid-cols-4/)
  assert.match(source, /aria-label="第几次路演"/)
  assert.match(source, /aria-label="路演时间"/)
  assert.match(source, /aria-label="路演时间"[^>]*onClick=\{\(event\) => event\.currentTarget\.showPicker\?\.\(\)\}/)
  assert.match(source, /aria-label="路演地点"/)
  assert.match(source, /placeholder="路演地点（可选）"/)
  assert.match(source, /aria-label="路演天气"/)
  assert.match(source, /placeholder="路演天气（可选）"/)
})

test('路演歌曲卡使用克制的低对比度描边', () => {
  const source = readFileSync(roadshowPanelUrl, 'utf8')

  assert.doesNotMatch(source, /border-white\/8\b/)
  assert.match(source, /border-white\/10 bg-black\/25 p-3/)
  assert.match(source, /border-white\/10 bg-black\/25 p-2\.5/)
})

test('我的档案整合日常练习批量记录和月周日折叠历史', () => {
  assert.ok(existsSync(dailyPracticePanelUrl), 'daily practice panel must exist')
  const daily = readFileSync(dailyPracticePanelUrl, 'utf8')
  const archive = readFileSync(roadshowPanelUrl, 'utf8')
  const station = readFileSync(stationUrl, 'utf8')

  assert.match(archive, /DailyPracticePanel/)
  assert.match(archive, /'practice' \| 'roadshows'/)
  assert.match(archive, /日常练习/)
  assert.match(archive, /路演档案/)
  assert.match(daily, /记录今日练习/)
  assert.match(daily, /groupPracticeRecordsByCalendar/)
  assert.match(daily, /saveSongRecords/)
  assert.match(daily, /<details/)
  assert.match(daily, /<summary/)
  assert.match(daily, /补充文字（可选）/)
  assert.match(daily, /手动添加曲库外歌曲/)
  assert.match(station, /songs=\{catalogSongs\}[\s\S]*records=\{songRecords\}/)
  assert.match(station, /onRecordsChange=\{commitSongRecords\}/)
  assert.match(station, /activeSection !== 'roadshows'/)
})

test('练习日历桌面端只保留一个外层滚动区且移动端自然展开', () => {
  const daily = readFileSync(dailyPracticePanelUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.doesNotMatch(daily, /PRACTICE_SCROLL_THRESHOLD|scrollRegionProps/)
  assert.match(daily, /<aside className="practice-history practice-history-scroll" tabIndex=\{0\} aria-label="练习日历">/)
  assert.match(daily, /<div className="practice-month-content">/)
  assert.match(daily, /<div className="practice-week-content">/)
  assert.match(daily, /<div className="practice-day-records">/)

  assert.doesNotMatch(css, /\.practice-scroll-region/)
  assert.match(css, /\.practice-history-scroll\s*\{[^}]*max-height:min\(40rem,calc\(100vh - 8rem\)\);[^}]*overflow-y:auto;[^}]*scrollbar-color:rgba\(251,146,60,\.52\) rgba\(255,255,255,\.04\);[^}]*\}/s)
  assert.match(css, /\.practice-history-scroll:focus-visible\s*\{[^}]*outline:1px solid rgba\(253,186,116,\.72\);[^}]*outline-offset:-2px;[^}]*\}/s)
  assert.match(css, /@media \(max-width: 900px\)[^{]*\{[\s\S]*?\.practice-history-scroll\s*\{[^}]*max-height:none;[^}]*overflow:visible;[^}]*\}/)
})

test('browser adapter routes public and private sync through the existing CloudBase singleton', () => {
  assert.ok(existsSync(cloudAdapterUrl), 'song request cloud adapter must exist')
  const source = readFileSync(cloudAdapterUrl, 'utf8')

  assert.match(source, /tcbApp\.callFunction/)
  assert.match(source, /ensureSignIn/)
  assert.match(source, /pullCloudVotes/)
  assert.match(source, /incrementCloudVote/)
  assert.match(source, /registerRoadshowWorkspace/)
  assert.match(source, /pullRoadshows/)
  assert.match(source, /saveRoadshow/)
  assert.match(source, /deleteRoadshow/)
  assert.match(source, /export const pullSongRecords/)
  assert.match(source, /export const saveSongRecord/)
  assert.match(source, /export const saveSongRecords/)
  assert.match(source, /export const deleteSongRecord/)
  assert.match(source, /export const pullArtistSettings/)
  assert.match(source, /export const pushArtistSettings/)
  assert.match(source, /action: 'songRecords:pull'/)
  assert.match(source, /action: 'songRecords:save'/)
  assert.match(source, /action: 'songRecords:saveBatch'/)
  assert.match(source, /action: 'songRecords:delete'/)
  assert.match(source, /action: 'artistSettings:pull'/)
  assert.match(source, /action: 'artistSettings:push'/)
})

test('歌曲详情页提供练习与路演记录并保留点歌按钮的独立行为', () => {
  assert.ok(existsSync(songDetailPanelUrl), 'song detail panel must exist')
  const station = readFileSync(stationUrl, 'utf8')
  const panel = readFileSync(songDetailPanelUrl, 'utf8')
  const roadshowPanel = readFileSync(roadshowPanelUrl, 'utf8')

  assert.match(station, /selectedSong/)
  assert.match(station, /openSongDetail/)
  assert.match(station, /event\.stopPropagation\(\)/)
  assert.match(station, /pullSongRecords/)
  assert.match(station, /SONG_REQUEST_SESSION_EVENT/)
  assert.match(station, /if \(!next\).*setSelectedSong\(null\).*setSelectedArtist\(null\)/s)
  assert.match(panel, /练习记录/)
  assert.match(panel, /路演记录/)
  assert.match(panel, /useState<JournalKind>\('practice'\)/)
  assert.match(panel, /aria-label="切换记录类型"/)
  assert.match(panel, /aria-pressed=\{activeJournal === 'practice'\}/)
  assert.match(panel, /aria-pressed=\{activeJournal === 'roadshow'\}/)
  assert.doesNotMatch(panel, /lg:w-4\/5/)
  assert.match(panel, /sm:items-start/)
  assert.doesNotMatch(panel, /data-journal-eyebrow|MY SONG JOURNAL/)
  assert.match(panel, /data-journal-description[\s\S]*role="status"/)
  assert.match(panel, /role="status"><Cloud className="h-2\.5 w-2\.5"/)
  assert.doesNotMatch(panel, /data-journal-toolbar.*role="status"/s)
  assert.match(station, /setRecordSyncStatus\('已同步'\)/)
  assert.doesNotMatch(station, /setRecordSyncStatus\('已从腾讯云同步'\)/)
  assert.match(panel, /RecordTimeline records=\{practices\}/)
  assert.match(panel, /RecordTimeline[^>]*records=\{roadshowNotes\}/)
  assert.match(panel, /type="datetime-local"/)
  assert.match(panel, /label="练习时间"/)
  assert.match(panel, /label="路演时间"/)
  assert.doesNotMatch(panel, /练习日期与时间|路演日期与时间/)
  assert.match(panel, /\[color-scheme:dark\]/)
  assert.match(panel, /showPicker\?\.\(\)/)
  assert.match(panel, /setPracticeAt\(event\.target\.value\)/)
  assert.match(panel, /setRoadshowAt\(event\.target\.value\)/)
  assert.doesNotMatch(panel, /练习分钟数|durationMinutes|累计[^<]*分/)
  assert.match(panel, /匹配度（70–100）/)
  assert.match(panel, /averageMatchScore\(practices\)/)
  assert.doesNotMatch(panel, /practices\[0\]\?\.matchScore/)
  assert.match(panel, /min="70" max="100"/)
  assert.doesNotMatch(panel, /匹配度（60–100）|min="60"/)
  assert.match(panel, /练习感受/)
  assert.match(panel, /label="弹唱感想"/)
  assert.match(panel, /getPracticeReflection\(record\)/)
  assert.doesNotMatch(panel, /label="问题描述"|label="改进办法"/)
  assert.match(panel, /观众称呼（可选）/)
  assert.match(panel, /现场反馈与观察/)
  assert.match(panel, /请先进入路演档案解锁/)
  assert.doesNotMatch(panel, /至少记录一项练习感受或弹唱感想/)
  assert.match(panel, /deleteSongRecord/)
  assert.match(panel, /const beginEdit = \(record: SongRecord\)/)
  assert.match(panel, /onDoubleClick=\{\(\) => onEdit\(record\)\}/)
  assert.match(panel, /onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}/)
  assert.match(panel, /id: editingRecord\?\.kind === 'practice' \? editingRecord\.id : recordId\('practice'\)/)
  assert.match(panel, /id: editingRecord\?\.kind === 'roadshow' \? editingRecord\.id : recordId\('roadshow'\)/)
  assert.match(panel, /editingRecord\?\.kind === 'practice' \? '保存修改' : '保存练习记录'/)
  assert.match(panel, /editingRecord\?\.kind === 'roadshow' \? '保存修改' : '保存路演记录'/)
  assert.match(roadshowPanel, /clearSongRecordCache/)
  assert.match(roadshowPanel, /SONG_REQUEST_SESSION_EVENT/)
  assert.match(roadshowPanel, /dispatchEvent/)
})

test('歌曲详情页在路演右侧用谱子标签承载上传与翻谱功能', () => {
  const panel = readFileSync(songDetailPanelUrl, 'utf8')
  const roadshowButton = panel.indexOf("setActiveJournal('roadshow')")
  const scoreButton = panel.indexOf("setActiveJournal('score')")

  assert.match(panel, /type JournalKind = 'practice' \| 'roadshow' \| 'score'/)
  assert.ok(roadshowButton >= 0 && scoreButton > roadshowButton, '谱子按钮应位于路演按钮右侧')
  assert.match(panel, /aria-pressed=\{activeJournal === 'score'\}/)
  assert.match(panel, /activeJournal === 'score' && \(\s*<section data-song-score-panel/)
  assert.match(panel, /activeJournal !== 'score' && \(\s*<div className="grid items-start/)
})

test('练习记录表单移除弹唱感想输入框但保留历史记录展示', () => {
  const panel = readFileSync(songDetailPanelUrl, 'utf8')

  assert.doesNotMatch(panel, /<Field label="弹唱感想">/)
  assert.doesNotMatch(panel, /placeholder="哪里卡住、为什么，以及下次怎样调整……"/)
  assert.match(panel, /<RecordText label="弹唱感想"/)
  assert.match(panel, /getPracticeReflection\(record\)/)
})

test('歌曲详情返回时恢复进入前的榜单歌手热门或识曲来源页', () => {
  const source = readFileSync(stationUrl, 'utf8')
  const goBackBody = source.match(/const goBack = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? ''

  assert.match(goBackBody, /if \(selectedSong\) \{\s*setSelectedSong\(null\);\s*return;/)
  assert.doesNotMatch(goBackBody, /setActiveSection\('artists'\)/)
  assert.doesNotMatch(goBackBody, /setSelectedArtist\(song\.artist\)/)
  assert.match(source, /const detailBackLabel = selectedSong/)
  assert.match(source, /selectedSong \? detailBackLabel/)
})

test('歌曲详情页会话只读取有效的现有私有空间凭据', async () => {
  const { readSongRecordSession, SONG_REQUEST_SESSION_EVENT } = await import(songRecordsModuleUrl.href)
  const values = new Map<string, string>([['jieyou-roadshow-session-v1', JSON.stringify({ alias: 'JIEYOU', password: 'guitar-2026' })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null }

  assert.deepEqual(readSongRecordSession(storage), { alias: 'JIEYOU', password: 'guitar-2026' })
  values.set('jieyou-roadshow-session-v1', JSON.stringify({ alias: '', password: '123' }))
  assert.equal(readSongRecordSession(storage), null)
  assert.equal(SONG_REQUEST_SESSION_EVENT, 'jieyou-song-request-session-change')
})
