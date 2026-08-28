# 全站歌手设置云同步设计

## 目标

让歌手排序、自定义头像和头像微调参数在 localhost 编辑后同步到腾讯云，并让 GitHub Pages 及所有访客读取同一份全站设置。

## 权限模型

- `artistSettings:pull` 公开读取，不要求私有空间凭据。
- `artistSettings:push` 必须通过现有点歌台私有空间的别称和管理口令认证。
- 第一位成功写入者的私有空间成为全站设置所有者；后续只允许同一空间写入。
- 公开响应不返回所有者标识、别称或口令。

## 数据模型

腾讯云集合 `song_request_artist_settings` 使用固定文档 `global`：

```ts
interface ArtistSettingsSnapshot {
  version: 1;
  revision: number;
  artistOrder: string[];
  customAvatars: Record<string, string>;
  avatarAdjustments: Record<string, {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }>;
  updatedAt: string;
}
```

服务端额外保存 `ownerWorkspaceId`，但公开读取时剥离。

边界如下：

- `artistOrder` 最多 200 个不重复歌手；歌手名必须为去除首尾空白后的 1–100 个字符。
- `customAvatars` 最多 100 项，`avatarAdjustments` 最多 200 项；两者的键必须同时存在于 `artistOrder`。
- 头像只接受合法的 `data:image/webp|png|jpeg;base64`；Base64 必须可解码且文件魔数与声明格式一致；每张解码后不超过 1 MiB。
- `x/y` 范围 0–100，`scale` 范围 1–4，`rotation` 范围 -30–30，全部必须为有限数值且不得包含额外字段。
- `artistSettings:push` 整个事件按 UTF-8 JSON 编码后不得超过 5 MiB；其他现有动作继续使用 256 KiB 限制。

## 接口契约

- 公开拉取：`{ action: 'artistSettings:pull' }` → `{ ok: true, snapshot: ArtistSettingsSnapshot | null }`。
- 管理员写入：`{ action: 'artistSettings:push', alias, password, expectedRevision: number | null, snapshot }` → `{ ok: true, snapshot }`。
- `expectedRevision: null` 只允许条件创建尚不存在的 `global` 文档；文档已存在时返回 `CONFLICT`。普通更新必须传当前正整数 revision。
- `snapshot: null` 只表示成功读取且云端确实尚无快照；网络、云函数或数据库失败仍返回/抛出 `SYNC_FAILED`，绝不触发首次迁移。
- 写入鉴权失败返回 `AUTH_FAILED`；所有者不匹配返回 `AUTH_FAILED`；修订号不匹配或首次认领竞争失败返回 `CONFLICT`；非法快照返回 `INVALID_ARTIST_SETTINGS`；超限返回 `PAYLOAD_TOO_LARGE`。
- 服务端忽略客户端 `updatedAt/revision`，以事务生成的 `revision = current + 1` 和服务器时间为准。

## 同步流程

1. 页面先使用当前 localStorage 快照，保证离线可用；另用 `jieyou-artist-settings-dirty-v1` 保存未同步草稿产生时的 `baseRevision: number | null`，并缓存最近一次确认的云端 `revision`。
2. 页面挂载后公开拉取云端快照。若本地没有未同步草稿，云端存在时以云端为准并更新状态和缓存。
3. 只有拉取成功且明确得到 `snapshot: null`、当前浏览器已有私有空间会话、本地确有非默认排序/头像/微调设置时，才自动上传 localhost 快照并首次认领所有权。
4. 若本地有草稿且已有私有空间会话，只有草稿的 `baseRevision` 与刚拉取的云端 revision 相同才自动推送；不一致则保留草稿并进入 `CONFLICT`，绝不把旧草稿重新绑定到新 revision。没有会话时同样保留草稿并提示需进入私有空间同步。
5. 完成排序、上传头像或结束头像微调时，立即保存在本地、标记草稿，再使用私有空间凭据上传完整快照。上传按单飞队列串行执行，成功后仅在没有更新草稿时清除 dirty 标记。
6. `CONFLICT` 时保留本地草稿并提示云端已有更新，不自动覆盖另一页面的新版本；管理员刷新云端后重新操作即可。
7. 云端失败时保留本地结果，显示简短状态，不清空任何设置。

## 排序合并

云端顺序只重排当前曲库中仍存在的歌手；本地新增但云端未知的歌手追加在末尾。这样源码新增歌手不会被旧快照隐藏。

## 冲突策略

云端是全站真相来源。服务端使用事务完成首次所有者认领和基于 `expectedRevision` 的条件写入；同一页面的推送串行。设置页是单管理员场景，不引入复杂逐字段冲突合并。

初始化拉取期间允许查看页面；若用户在拉取完成前编辑，dirty 标记会阻止迟到的云端响应覆盖本地修改。

## 清理与恢复

- 写入前只保留 `artistOrder` 中仍存在的头像与微调键，删除失效歌手数据。
- 如需转移所有者，由维护者在腾讯云控制台删除 `song_request_artist_settings/global` 后，由新的私有空间执行首次写入；不增加额外管理界面。

## 影响文件

- `cloudfunctions/songRequestSync/validation.js`：新增请求与快照校验。
- `cloudfunctions/songRequestSync/index.js`：新增公开拉取、所有者保护写入及集合适配。
- `src/components/SongRequest/artistSettings.ts`：快照解析、排序合并、本地草稿及同步状态协调纯函数。
- `src/components/SongRequest/songRequestCloud.ts`：新增拉取/推送适配器。
- `src/components/SongRequest/SongRequestStation.tsx`：初始化、首次迁移和编辑完成后的同步。
- `tests/songRequest.test.ts`、`tests/songRequestSyncFunction.test.cjs`：前后端回归测试。

## 验证

- 云函数：公开读取、两个 `expectedRevision: null` 并发认领仅一个成功、同一所有者按修订号更新、旧修订拒绝、其他空间拒绝、非法/损坏/过大头像拒绝。
- 前端纯函数：云端快照解析、顺序合并、新歌手保留、坏缓存回退、拉取期间编辑、推送期间再次编辑、队列重定基、冲突/失败保留草稿，以及仅最新草稿成功后清除 dirty。
- 页面集成：挂载拉取、仅在明确空快照时迁移、旧 dirty 草稿遇到较新云端 revision 不得自动覆盖、排序/头像完成后串行推送、无凭据不误写。
- 故障边界：服务端数据读取失败和浏览器网络失败均保持本地状态、返回 `SYNC_FAILED`，且绝不进入首次认领。
- 运行点歌台测试、云函数测试、TypeScript 检查；生产构建若再次遇到已知 `esbuild spawn EPERM` 则按仓库规则止损并如实说明。
