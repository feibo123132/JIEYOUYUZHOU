# 点歌台跨端同步：CloudBase 一次性配置

前端与云函数代码已经完成。首次上线只需在当前 `VITE_TCB_ENV_ID` 对应的腾讯云开发环境配置一次。

## 1. 开启匿名登录

在 CloudBase 控制台开启“匿名登录”。观众无需注册账号，也不需要同步码。

## 2. 创建三个数据集合

```text
song_request_votes
song_request_workspaces
song_request_song_records
```

两个集合的客户端安全规则都设为：

```json
{
  "read": false,
  "write": false
}
```

浏览器只调用云函数，不能绕过管理口令直接读取私有路演记录、练习记录或歌曲现场反馈。`song_request_song_records` 每条记录单独保存，并由云函数事务处理保存与软删除，避免多设备同时操作时互相覆盖。

## 3. 云存储谱子

谱子图片保存在 `song-request-scores/` 目录，数据库只保存 `cloud://` 文件引用。云存储继续使用 `PRIVATE`（仅创建者和管理员可读写）；其他设备由云函数鉴权后获取临时访问地址，不需要开放整个存储桶。

## 4. 部署云函数

代码目录：`cloudfunctions/songRequestSync`

控制台方式：创建名为 `songRequestSync` 的普通事件云函数，上传该目录并选择“安装依赖”。

CLI 方式：

```powershell
tcb fn deploy songRequestSync --force --deployMode zip
```

仓库根目录已经包含 `cloudbaserc.json`。请不要再加 `--dir`；CloudBase CLI 3.8.0 在无配置更新模式下可能误将整个项目打包。

函数调用权限允许已登录用户调用（匿名登录也属于已登录）：

```json
{
  "*": { "invoke": false },
  "songRequestSync": { "invoke": "auth != null" }
}
```

更新本功能后也需要重新执行一次上述部署命令，使 `songRecords:pull/save/delete` 生效。

完成后：观众点歌会汇总到跨设备“点歌榜”；“路演”首次使用时填写别称和自定义管理口令，其他设备使用同一组内容即可进入。口令只在当前浏览器会话中保留，云端仅保存加盐哈希；路演档案、歌曲练习记录与歌曲现场反馈都不会开放给普通访客。
