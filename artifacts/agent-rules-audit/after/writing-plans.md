---
name: writing-plans
description: Use when a multi-step change has material dependencies or needs a durable execution plan.
---

# writing-plans

计划用于减少遗漏，不是实施许可。
- 简单改动省略计划文件；多步骤任务列出目标、受影响文件、关键依赖和最小验收检查。
- 仅在跨会话、多人协作或用户要求时保存可持续维护的计划；不在计划里复制整段实现代码。
- 用户已经要求实现且范围明确时，计划完成后直接执行，不再询问“是否开始”。
- 不强制工作树、子代理、每步提交或与任务无关的重构。用户变更目标时更新相关步骤。
