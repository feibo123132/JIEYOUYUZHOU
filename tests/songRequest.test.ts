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
const indexCssUrl = new URL('../src/index.css', import.meta.url)

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
  ), {
    ...sampleArtistSettingsPayload,
    artistOrder: ['周杰伦'],
  })
})

test('artist settings draft is validated and survives pull conflicts or failures', async () => {
  const {
    ARTIST_SETTINGS_DRAFT_KEY, createArtistSettingsDraft, loadArtistSettingsDraft,
    ensureArtistSettingsRetryDraft, resolveArtistSettingsPull, saveArtistSettingsDraft,
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
  assert.equal(resolveArtistSettingsPull({ cloud, local: sampleArtistSettingsPayload, draft, hasSession: true, defaultArtistOrder: sampleArtistSettingsPayload.artistOrder }).kind, 'conflict')
  assert.equal(resolveArtistSettingsPull({ cloud: { ...cloud, revision: 2 }, local: sampleArtistSettingsPayload, draft, hasSession: true, defaultArtistOrder: sampleArtistSettingsPayload.artistOrder }).kind, 'push-draft')
  assert.equal(resolveArtistSettingsPull({ cloud: null, local: sampleArtistSettingsPayload, draft: null, hasSession: true, defaultArtistOrder: ['周杰伦', '林俊杰', '孙燕姿'] }).kind, 'seed-cloud')
  assert.throws(() => { throw new Error('SYNC_FAILED') }, /SYNC_FAILED/)
  assert.deepEqual(loadArtistSettingsDraft(storage), draft, 'pull failure must preserve the local draft')

  values.delete(ARTIST_SETTINGS_DRAFT_KEY)
  const retryDraft = ensureArtistSettingsRetryDraft(
    storage, sampleArtistSettingsPayload, ['周杰伦', '林俊杰', '孙燕姿'], null,
  )
  assert.deepEqual(loadArtistSettingsDraft(storage), retryDraft, 'a first pull failure must create a retryable draft')
  assert.deepEqual(
    ensureArtistSettingsRetryDraft(storage, sampleArtistSettingsPayload, ['周杰伦', '林俊杰', '孙燕姿'], null),
    retryDraft,
    'repeated retries must not replace the pending draft',
  )
  values.delete(ARTIST_SETTINGS_DRAFT_KEY)
  const defaultPayload = { ...sampleArtistSettingsPayload, customAvatars: {}, avatarAdjustments: {} }
  assert.equal(
    ensureArtistSettingsRetryDraft(storage, defaultPayload, defaultPayload.artistOrder, null),
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
    陈奕迅: ['富士山下', '爱情转移'],
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

test('第三版曲库缓存会补齐新默认歌曲并升级到第五版', async () => {
  const { CATALOG_STORAGE_KEY, loadEditableCatalog } = await loadModule()
  const newDefaultSong = { id: 'default:new-v4', title: '新增默认歌', artist: '新增歌手', category: '华语流行', featured: false, hotComment: '新增热评' }
  const storage = {
    getItem: (key: string) => key === CATALOG_STORAGE_KEY
      ? JSON.stringify({ version: 3, artists: ['周杰伦', 'Coldplay'], songs })
      : null,
  }

  const catalog = loadEditableCatalog(storage, [...songs, newDefaultSong])

  assert.equal(catalog.version, 5)
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
    moveCatalogArtist, removeCatalogArtist, removeCatalogSong, saveEditableCatalog,
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

  assert.equal(catalog.version, 5)
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

  assert.equal(catalog.version, 5)
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'a')?.featured, true)
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'default:new')?.title, '新版热门歌')
  assert.equal(catalog.songs.find((song: { id: string }) => song.id === 'custom:kept')?.title, '保留的自定义歌曲')
  assert.ok(catalog.artists.includes('新歌手'))
  assert.ok(catalog.artists.includes('自定义歌手'))
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
  assert.match(station, /getRankingMedalTone\(index, personalRankingPodiumSize\)/)
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
  assert.match(source, /grid gap-3 sm:grid-cols-2 lg:grid-cols-4\"\>\{artistGroups/)
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
  assert.match(source, /visiblePersonalRanking\.length > PERSONAL_RANKING_SCROLL_THRESHOLD/)
  assert.match(source, /max-h-\[42rem\] overflow-y-auto/)
  assert.match(source, /aria-label="个人练习榜歌手筛选"/)
  assert.match(source, /placeholder="搜索歌手或歌曲"/)
  assert.match(source, />总榜</)
  assert.match(source, /groupSongsByArtist\(catalogSongs\)\.filter\(\(\{ songs \}\) => songs\.length >= 2\)/)
  assert.match(source, /className="mt-3 grid max-h-\[34rem\] grid-cols-2 gap-2 overflow-y-auto/)
  assert.match(source, /setPersonalRankingArtist\(artist\)/)
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
  assert.match(source, /runArtistSettingsPush/)
  assert.match(source, /ensureArtistSettingsRetryDraft/)
  assert.match(source, /window\.addEventListener\('online', retryArtistSettingsPush\)/)
  assert.match(source, /window\.addEventListener\('focus', retryArtistSettingsPush\)/)
  assert.match(source, /if \(artistOrderMode\) syncCurrentArtistSettings\(\)/)
  assert.match(source, /if \(avatarAdjustMode\) syncCurrentArtistSettings\(\)/)
})

test('groups songs by singer while preserving catalog order', async () => {
  const { groupSongsByArtist } = await loadRoadshowModule()
  const groups = groupSongsByArtist(songs)

  assert.deepEqual(groups.map((group: { artist: string, songs: Array<{ id: string }> }) => [group.artist, group.songs.map((song) => song.id)]), [
    ['周杰伦', ['a', 'c']],
    ['Coldplay', ['b']],
  ])
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
  assert.match(station, /useState\(createInitialBarragePreferences\)/)
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

test('roadshow panel keeps performance and recognition songs distinct', () => {
  assert.ok(existsSync(roadshowPanelUrl), 'roadshow panel must exist')
  const source = readFileSync(roadshowPanelUrl, 'utf8')

  assert.match(source, /路演歌曲/)
  assert.match(source, /本次准备演唱的歌曲/)
  assert.match(source, /听歌识曲/)
  assert.match(source, /互动游戏准备的题目歌曲/)
  assert.match(source, /从曲库添加/)
  assert.match(source, /手动添加曲库外歌曲/)
  assert.match(source, /锁定档案/)
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

test('练习日历月周日超过八首时分别启用限高滚动', () => {
  const daily = readFileSync(dailyPracticePanelUrl, 'utf8')
  const css = readFileSync(indexCssUrl, 'utf8')

  assert.match(daily, /const PRACTICE_SCROLL_THRESHOLD = 8;/)
  assert.match(daily, /const scrollable = recordCount > PRACTICE_SCROLL_THRESHOLD;/)
  assert.match(daily, /scrollable \? \{ tabIndex: 0, 'aria-label': label \} : \{\}/)
  assert.match(daily, /scrollRegionProps\(\s*'practice-month-content',\s*monthRecords\.length,/)
  assert.match(daily, /scrollRegionProps\(\s*'practice-week-content',\s*weekRecords\.length,/)
  assert.match(daily, /scrollRegionProps\(\s*'practice-day-records',\s*day\.records\.length,/)

  assert.match(css, /\.practice-month-content,\.practice-week-content\s*\{\s*min-height:0;\s*\}/)
  assert.match(css, /\.practice-scroll-region\s*\{[^}]*max-height:30\.55rem;[^}]*overflow-y:auto;[^}]*scrollbar-color:rgba\(251,146,60,\.52\) rgba\(255,255,255,\.04\);[^}]*\}/s)
  assert.match(css, /\.practice-scroll-region:focus-visible\s*\{[^}]*outline:1px solid rgba\(253,186,116,\.72\);[^}]*outline-offset:-2px;[^}]*\}/s)
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
  assert.match(station, /setActiveSection\('artists'\)/)
  assert.match(station, /setSelectedArtist\(song\.artist\)/)
  assert.match(station, /if \(!next\).*setSelectedSong\(null\).*setSelectedArtist\(null\)/s)
  assert.match(panel, /练习记录/)
  assert.match(panel, /路演记录/)
  assert.match(panel, /useState<JournalKind>\('practice'\)/)
  assert.match(panel, /aria-label="切换记录类型"/)
  assert.match(panel, /aria-pressed=\{activeJournal === 'practice'\}/)
  assert.match(panel, /aria-pressed=\{activeJournal === 'roadshow'\}/)
  assert.doesNotMatch(panel, /lg:w-4\/5/)
  assert.match(panel, /sm:items-start/)
  assert.match(panel, /data-journal-eyebrow.*MY SONG JOURNAL.*role="status"/s)
  assert.match(panel, /role="status"><Cloud className="h-2\.5 w-2\.5"/)
  assert.doesNotMatch(panel, /data-journal-toolbar.*role="status"/s)
  assert.match(station, /setRecordSyncStatus\('已同步'\)/)
  assert.doesNotMatch(station, /setRecordSyncStatus\('已从腾讯云同步'\)/)
  assert.match(panel, /RecordTimeline records=\{activeJournal === 'practice' \? practices : roadshows\}/)
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

test('歌曲详情页会话只读取有效的现有私有空间凭据', async () => {
  const { readSongRecordSession, SONG_REQUEST_SESSION_EVENT } = await import(songRecordsModuleUrl.href)
  const values = new Map<string, string>([['jieyou-roadshow-session-v1', JSON.stringify({ alias: 'JIEYOU', password: 'guitar-2026' })]])
  const storage = { getItem: (key: string) => values.get(key) ?? null }

  assert.deepEqual(readSongRecordSession(storage), { alias: 'JIEYOU', password: 'guitar-2026' })
  values.set('jieyou-roadshow-session-v1', JSON.stringify({ alias: '', password: '123' }))
  assert.equal(readSongRecordSession(storage), null)
  assert.equal(SONG_REQUEST_SESSION_EVENT, 'jieyou-song-request-session-change')
})
