import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const moduleUrl = new URL('../src/components/SongRequest/songRequest.ts', import.meta.url)
const stationUrl = new URL('../src/components/SongRequest/SongRequestStation.tsx', import.meta.url)
const roadshowModuleUrl = new URL('../src/components/SongRequest/roadshow.ts', import.meta.url)
const roadshowPanelUrl = new URL('../src/components/SongRequest/RoadshowPanel.tsx', import.meta.url)
const cloudAdapterUrl = new URL('../src/components/SongRequest/songRequestCloud.ts', import.meta.url)
const catalogModuleUrl = new URL('../src/components/SongRequest/songCatalog.ts', import.meta.url)

const songs = [
  { id: 'a', title: '晴天', artist: '周杰伦', category: '华语', featured: true },
  { id: 'b', title: 'Yellow', artist: 'Coldplay', category: '欧美', featured: false },
  { id: 'c', title: '稻香', artist: '周杰伦', category: '华语', featured: true },
]

async function loadModule() {
  assert.ok(existsSync(moduleUrl), 'song request helper must exist')
  return import(moduleUrl.href)
}

async function loadRoadshowModule() {
  assert.ok(existsSync(roadshowModuleUrl), 'roadshow helper must exist')
  return import(roadshowModuleUrl.href)
}

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
  }

  assert.deepEqual([...new Set(SONGS.map((song: { artist: string }) => song.artist))], Object.keys(expectedByArtist))
  for (const [artist, titles] of Object.entries(expectedByArtist)) {
    assert.deepEqual(SONGS.filter((song: { artist: string }) => song.artist === artist).map((song: { title: string }) => song.title), titles)
  }
  assert.equal(new Set(SONGS.map((song: { id: string }) => song.id)).size, SONGS.length)
  assert.ok(SONGS.every((song: { category: string }) => song.category === '华语流行'))
  assert.ok(SONGS.every((song: { hotComment?: string }) => Boolean(song.hotComment?.trim())))
  assert.deepEqual(SONGS.filter((song: { featured: boolean }) => song.featured).map((song: { title: string }) => song.title), ['晴天'])
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
    removeCatalogArtist, removeCatalogSong, saveEditableCatalog,
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

  assert.equal(catalog.version, 2)
  assert.deepEqual(catalog.artists, ['周杰伦', 'Coldplay', '新默认歌手', '自定义歌手'])
  assert.deepEqual(catalog.songs.map((song: { id: string }) => song.id), ['a', 'b', 'c', 'default:new', 'custom:legacy'])
})

test('featured songs remain an unranked catalog subset', async () => {
  const { getFeaturedSongs } = await loadModule()
  assert.deepEqual(getFeaturedSongs(songs).map((song: { id: string }) => song.id), ['a', 'c'])
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
  assert.match(source, /id: 'ranking'.*label: '点歌榜'/s)
  assert.match(source, /id: 'artists'.*label: '歌手'/s)
  assert.match(source, /id: 'roadshows'.*label: '路演'/s)
  assert.match(source, /id: 'playlists'.*label: '歌单'/s)
  assert.match(source, /activeSection === null/)
  assert.doesNotMatch(source, /id: 'languages'/)
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
  assert.match(source, /锁定路演/)
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
})
