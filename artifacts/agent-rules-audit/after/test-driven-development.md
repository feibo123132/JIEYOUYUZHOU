---
name: test-driven-development
description: Use when implementing behavior changes or bug fixes that benefit from executable regression tests.
---

# test-driven-development

测试应验证需求和失败后果。
- 对可测试的行为变更，先写最小失败案例，确认因目标行为缺失而失败，再实现并运行相关测试。
- 核心数据、权限、同步逻辑覆盖关键异常；修正测试配置失败后再判断行为是否失败。
- 文案、样式和低影响机械编辑用定向检查，不强制新增测试或为了例外再次征求许可。
- 不写仅镜像源码结构的测试；不为简单验证重构产品代码。
- 不删除已有正确实现来补做红绿流程；检查最终行为，补有价值的回归测试，并如实报告验证范围。
