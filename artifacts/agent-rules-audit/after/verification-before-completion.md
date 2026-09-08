---
name: verification-before-completion
description: Use before reporting implemented behavior, tests, builds, or deployment as successful.
---

# verification-before-completion

成功声明必须对应实际证据。
- 运行与修改风险匹配的必要检查，读取退出码与相关输出。
- 已经验证且无新修改，不为了交付再次运行相同检查。
- 区分逻辑测试、类型检查、构建、界面验证和发布结果；某一项通过不能代替其他项。
- 本次缺陷要修复；既有失败、环境阻塞和未执行检查准确说明，不虚报完成，也不让无关检查无限拖延交付。
- 只有需求要求或出现具体风险时才升级为全量测试、浏览器验证或独立审查。
