---
name: finishing-a-development-branch
description: Use when the user requests branch integration, a PR, merge, or cleanup after development.
---

# finishing-a-development-branch

完成方式由用户目标决定。
- 只要求修改代码时，完成必要验证后交付当前成果；不强制四选一菜单。
- 用户已授权提交、推送、PR 或合并时，检查目标和真实差异后执行对应步骤，不重新批准相同操作。
- 只纳入本次相关修改；关键验证失败不能声称可以合并，允许交付标明限制的草稿成果。
- 不自动删除分支或工作树；确需清理时先核对范围、未提交内容及用户授权。
- 缺少必要目标信息才询问，不猜远端或破坏已有工作。
