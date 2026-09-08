---
name: systematic-debugging
description: Use when a bug, test failure, or unexpected behavior needs root-cause investigation.
---

# systematic-debugging

先收集足够证据确定原因，再做最小修复。
- 读取实际报错和相关实现，区分代码、配置、权限和外部服务问题。
- 复杂问题提出可证伪假设并做最小实验；明显且已定位的错误直接修复，不强制四阶段文档。
- 行为缺陷补相关回归验证；诊断工具与日志限于需要，不因为排查新增整套监控。
- 同类失败没有新证据不重试；环境问题按 AGENTS.md 的权限和超时规则处理。
- 次数不是架构有问题的证据。只有观察支持时才扩大调查，不因试错次数要求重构或批准。
- 用户输入真正不可替代时才求助，其余可修复工作继续。
