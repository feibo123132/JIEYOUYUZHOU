# 点歌台跨端同步：CloudBase 一次性配置

前端与云函数代码已经完成。首次上线只需在当前 `VITE_TCB_ENV_ID` 对应的腾讯云开发环境配置一次。

## 1. 开启匿名登录

在 CloudBase 控制台开启“匿名登录”。观众无需注册账号，也不需要同步码。

## 2. 创建两个数据集合

```text
song_request_votes
song_request_workspaces
```

两个集合的客户端安全规则都设为：

```json
{
  "read": false,
  "write": false
}
```

浏览器只调用云函数，不能绕过管理口令直接读取私有路演记录。

## 3. 部署云函数

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

完成后：观众点歌会汇总到跨设备“点歌榜”；“路演”首次使用时填写别称和自定义管理口令，其他设备使用同一组内容即可进入。口令只在当前浏览器会话中保留，云端仅保存加盐哈希；路演记录不会开放给普通访客。
