# JIEYOU 宇宙（星空树洞/点歌台）项目长期笔记

## 仓库环境（重要）
- git 仓库 **无任何 commit**（main 为 unborn 分支），全部文件已暂存；**git 对象库损坏**（`.git/objects/pack/` 缺 `.pack` 文件，`git diff`/`git stash`/`checkout-index` 均报 unable to read sha1）。不要依赖 git 历史/暂存区恢复文件，改动需直接以磁盘文件为准。
- `npm test` 全量存在 14 个**预先存在**的失败（测试断言与源码脱节），与本项目功能改动无关；全量测试在无测试文件时会挂起等待 stdin，避免后台全量跑。
- 代码协作规范：批量提交多处文本修改但仅改明确指定内容，其余保持原状；大段 Python 脚本勿用 `python -c` 内嵌（bash 会 bad substitution），写入临时 .py 文件再执行。

## 点歌台（SongRequest）数据模型
- 三层数据：内置 SONGS（songCatalog.ts，只读）/ localStorage 可编辑目录（EditableCatalog v7）/ 云端 artistSettings（站主 2421415030@qq.com 通过 requireCatalogManager 管理）。
- 练习记录：SongRecord 联合类型，`kind: 'practice'` 含 matchScore(70–100) 整数；`averageMatchScore` 返回保留 1 位小数的均值或 null。
- **三个指数共用一套刻度**：matchScore（匹配度）/ chorusScore（合唱指数）/ strumScore（狂扫指数）都是 70–100 整数 + `getMatchQuality()` 品质分档；榜单 `PracticeBoard = 'practice' | 'chorus' | 'strum'`（练习榜/合唱榜/狂扫榜）。狂扫另有 `strumBpm`（20–300，`STRUM_BPM_MIN/MAX` 前端与云函数各一份）。三者取「多次练习最高值」，BPM 取「最高分那次的」，别改成最近一条。
- 排序/同步路径：`commitCatalog`（本地持久化）→ `commitSongOrder`（权限校验+持久化+`syncCurrentArtistSettings` 云同步）。
- 点歌/投票系统：云函数 `songRequestSync`，votes 集合按 songId 为文档：`count`（总榜）+ `locationCounts.{medicalWuming|medicalMain|nanhu}`（分地点）；`votes:pull` 按 request.location 读对应桶，无地点读 count；`votes:finishAll`（唱完）把待唱累加到站主 workspace 的 `sungVoteCounts`/`sungVoteCountsByLocation`。归类决策**后端权威**：优先 request.location（validation 已放行），否则按 `latestRoadshowLocation(owner)` 取站主最近路演地点，无路演则只进总榜。`incrementCloudVote` 返回 `{ count, location }` 供前端提示去向。
- 练习徽章：`songPracticeStats` memo 聚合 `{count, score}`；显示开关持久化在 `localStorage` `jieyou_show_practice_badges`。

## 谱子（SongScore）图片加载（重要坑）
- 云端只存 `cloud://.../song-request-scores/...jpg` fileID（`toStoredSongScore` 会剥离 pageUrls）；显示必须用 `getTempFileURL` 换签名地址，**签名地址有有效期**。
- 因此：`pullSongScores` 只要含 cloud fileID 就一律重新换取，**不要**信任已存的 pageUrls；`saveSongScoreCache` 会把签名地址一起写进 localStorage，冷启动可能先渲染到过期地址。
- `src/components/SongRequest/useResolvedScorePages.ts`：谱子地址自愈 Hook（挂载/切歌/回前台/网络恢复/定时换链 + `<img onError>` 换新重试，节流 2h/20min、重试上限 4 次、`#score-retry=N` 片段强制重发请求、`generationRef` 防切歌串数据）。`SongDetailPanel`（缩略图）与 `ScoreViewer`（翻谱器 `onPagesStale`）共用。
- 同类问题排查思路：iPad/长驻页面上「先正常、放一阵子变裂图、刷新后恢复」= 临时签名地址过期，不是存储/权限/网络问题。

## 本地环境坑（症状容易被误判成代码 Bug）
- **「开了代理就同步失败 / 谱子裂图」先查 Clash 模式**：CFW 便携版在 `D:\Clash.for.Windows-0.20.16-ikuuu`，控制器 `127.0.0.1:58442`（`secret` 为空）。`GET /configs` 看 `mode`；`mode=global` 时 profile 里 9816 条分流规则**全部失效**，腾讯云 API/COS 从境外落地会 TLS 握手失败（curl 返回 000），同时 github/youtube 却正常 —— 这个组合基本就是全局模式。修：`PATCH /configs {"mode":"rule"}` 或 CFW「代理」页顶部选「规则」（PATCH 只改运行时，不落盘）。
- 判断口诀：`curl --noproxy '*'` 通、`curl -x 127.0.0.1:7890` 不通 = 路由问题，不是代码。
- 顺手清理：`data/config.yaml` 是 iKuuu 占位配置（节点名「您选错了配置/此配置无节点」、规则仅 `MATCH,DIRECT`），误选会表现为"代理开着但完全不生效"。

## 用户偏好
- 中文输出，结构化（标题/视角/正文/引用/小结），精良 HTML 排版与考究动效，禁用 Inter 字体。
