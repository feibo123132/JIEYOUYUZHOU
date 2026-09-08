---
name: executing-plans
description: Use when implementing an existing plan with multiple dependent steps.
---

# executing-plans

读取计划并核对当前代码，执行全部已授权步骤。
- 常规缺口自行补齐；实质性歧义只暂停相关步骤，继续独立工作。
- 本次代码或测试缺陷先定位修复；环境失败限定尝试，不把每个失败都转成用户问题。
- 按依赖顺序推进，必要时修正已过时的实施细节，保持原目标。
- 复用已有验证结果；完成后交付，不强制切换另一套技能或弹出分支操作菜单。
