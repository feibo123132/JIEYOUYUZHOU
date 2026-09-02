# JIEYOU 宇宙（星空树洞/点歌台）项目长期笔记

## 仓库环境（重要）
- git 仓库 **无任何 commit**（main 为 unborn 分支），全部文件已暂存；**git 对象库损坏**（`.git/objects/pack/` 缺 `.pack` 文件，`git diff`/`git stash`/`checkout-index` 均报 unable to read sha1）。不要依赖 git 历史/暂存区恢复文件，改动需直接以磁盘文件为准。
- `npm test` 全量存在 14 个**预先存在**的失败（测试断言与源码脱节），与本项目功能改动无关；全量测试在无测试文件时会挂起等待 stdin，避免后台全量跑。
- 代码协作规范：批量提交多处文本修改但仅改明确指定内容，其余保持原状；大段 Python 脚本勿用 `python -c` 内嵌（bash 会 bad substitution），写入临时 .py 文件再执行。

## 点歌台（SongRequest）数据模型
- 三层数据：内置 SONGS（songCatalog.ts，只读）/ localStorage 可编辑目录（EditableCatalog v7）/ 云端 artistSettings（站主 2421415030@qq.com 通过 requireCatalogManager 管理）。
- 练习记录：SongRecord 联合类型，`kind: 'practice'` 含 matchScore(70–100) 整数；`averageMatchScore` 返回保留 1 位小数的均值或 null。
- 排序/同步路径：`commitCatalog`（本地持久化）→ `commitSongOrder`（权限校验+持久化+`syncCurrentArtistSettings` 云同步）。

## 用户偏好
- 中文输出，结构化（标题/视角/正文/引用/小结），精良 HTML 排版与考究动效，禁用 Inter 字体。
