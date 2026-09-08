---
name: using-git-worktrees
description: Use when concurrent work or conflicting changes require an isolated Git checkout, or the user requests one.
---

# using-git-worktrees

先确认是否需要隔离；普通已授权小改动可在当前工作区完成。
- 创建前检查分支、工作区状态、现有工作树和项目约定；保护用户未提交修改。
- 在已允许写入的目录选用现有约定位置，不为一般路径选择要求用户决策。新分支默认使用 codex/ 前缀。
- 仓库内工作树目录应被忽略；范围内可调整忽略规则，不擅自提交。不能安全建立隔离时继续可独立完成的工作并说明限制。
- 基线测试失败先判断与任务关系；无关失败可记录后继续，影响可靠性的失败需要处理。
- 清理前核对绝对路径、Git 状态及是否仍被使用；保留未提交和用户需要的工作，不因创建 PR 自动删除工作树。
