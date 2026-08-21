# 猫咪预设跨端同步：CloudBase 一次性配置

代码与网页包已经包含同步功能。首次上线只需在当前 `VITE_TCB_ENV_ID` 对应的腾讯云开发环境完成以下配置。

## 1. 开启匿名登录

在 CloudBase 控制台的登录方式中开启“匿名登录”。如已安装并登录新版 CLI，可检查：

```powershell
tcb env login get -e <环境ID> --json
```

## 2. 创建数据集

创建文档型数据库集合：

```text
cat_preset_snapshots
```

集合的客户端安全规则设为：

```json
{
  "read": false,
  "write": false
}
```

浏览器不会直接访问此集合，只有云函数能读写。

## 3. 部署云函数

代码目录：`cloudfunctions/catPresetSync`

控制台方式：创建名为 `catPresetSync` 的普通事件云函数，上传该目录，并选择“安装依赖”。

CLI 方式：

```powershell
tcb fn deploy catPresetSync --dir .\cloudfunctions\catPresetSync --install-dependency true --env-id <环境ID> --yes
```

函数调用权限设为已登录用户可调用（匿名登录也属于已登录）：

```json
{
  "*": { "invoke": false },
  "catPresetSync": { "invoke": "auth != null" }
}
```

完成后打开猫咪生成器，在“预设保存 → 跨端同步”生成同步码；在手机输入同一码即可读取同一组预设。同步码相当于访问凭证，请勿公开。
