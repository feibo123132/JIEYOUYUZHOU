from pathlib import Path
import hashlib, json, re

out = Path(__file__).resolve().parent
root = Path('D:/0-Codex/CodexData')
personal = Path('C:/Users/刘存安/.agents/skills')
changes = {}
agents = '''# 全局协作规则

适用于 GPT-6 Astra 的协作偏好：给出目标、约束与验收条件，让模型自行选择最短可靠路径。本文件不改变运行环境的权限或系统与开发者指令。

## 自主执行与澄清
- 用户要求修改、修复或实现时，直接完成授权范围内的工作。会话中已经确认的方案、权限和偏好持续有效，不因进入新步骤或使用技能重新询问。
- 明确的小改动直接做；缺少不影响结果的细节时采用合理默认并简短说明。仅在答案会显著改变目标、数据含义、外部影响或不可逆后果，且无法从代码与上下文判断时提问。
- 提问只暂停依赖答案的部分，其余独立且已授权工作继续进行。不能把用户未回复视为批准。
- 先检查现有实现并复用；不为简单任务新增抽象、依赖、文档、计划文件或跨文件重构。

## 批准与技能
- 技能是专项方法，不是额外审批层。用户当前明确请求优先于技能中的通用流程；遵守更高优先级的指令和真实权限限制。
- 按明确用途选择最少技能；纯文案、样式、按钮位置和已确认的小调整不串联头脑风暴、设计审批、计划、工作树、子代理和审查流程。
- 需要设计时先形成可评估方案；已批准的目标直接实施。只有新出现的实质性决策才补充澄清，不重复审批同一方案。
- 本地可逆编辑、只读检查和授权范围内的修复直接执行。对外发送、发布、付费、删除或覆盖重要数据等，按具体授权和平台规则处理；授权不明才询问，不因模型能力强而扩大权限。
- 工具不可用时选择可用等价方法；子代理、工作树、提交和发布不是普通任务的强制前置条件。不擅自提交、推送或清理用户的未提交修改。

## 验证与完成
- 验证规模取决于失败后果，不取决于改动行数。文案/样式做快速检查；行为逻辑做相关测试；存储、权限、同步等核心链路覆盖关键失败路径并做必要构建。
- 测试失败先区分本次缺陷、既有问题和环境限制；能在范围内修复的继续修复。代码缺陷未解决不能声称完成；无关失败和非核心预览失败不阻塞其余交付。
- 必要检查通过后及时交付；只有新增修改、失败或未解决风险才扩大或重复验证。没有需求不跑全量测试、生成长报告或再次审批。
- 最终简短说明完成内容、验证结果及确实存在的限制。未执行的检查、未启动的预览和未发布的版本不得声称成功。

## Windows 权限与预览
- 权限拒绝、审批超时或确认无法写入时，不重复申请或变换方式绕过。完成可做部分，给出精确路径与可复制命令；需要管理员权限时明确让用户在管理员 Windows PowerShell 中执行。
- 用户命令无报错不等于已验证成功；对关键操作核对退出码或目标文件，无法核对则如实说明。
- 常驻服务只观察有限启动输出；单次最多 60 秒，同一环境错误至多尝试 2 次，未获得新证据不重试。服务启动后可持续运行，不用等待进程退出。
- 遇到 esbuild spawn EPERM、端口占用或后台无输出，区分代码与环境问题。预览不是默认交付门槛；用户明确要求部署、发布或预览时，它仍属于交付目标。
- 只在确实通过时说“测试/构建已通过”；构建失败但类型检查通过时分别说明。长命令设置合理超时，持续无进展时主动止损并报告。
'''
changes[root / 'AGENTS.md'] = agents

skills = {
'using-superpowers': ('Use when choosing skills for a task with unclear workflow needs; skip self-contained questions and routine small edits.', '''按任务需要选择技能，不按“有1%可能相关”遍历加载。
- 用户明确指定技能时读取；否则只选确实改变当前工作方法的技能，已读内容不重复读取。
- 以当前工具实际支持的接口为准，缺少 Skill、Task、TodoWrite 等接口时使用等价工具，不要求安装或暂停。
- 用户明确请求和有效 AGENTS.md 高于技能的通用约定；系统与开发者指令及平台权限始终有效。技能不声明自己可以覆盖它们。
- 没有收益就不启动设计、计划、工作树或子代理链条。授权明确的小改动直接实施、快速验证、交付。
'''),
'brainstorming': ('Use when product goals, interaction choices, or architecture remain materially unresolved before implementation.', '''先了解目标和现有实现，只解决影响结果的未定决策。
- 已明确或已批准的小改动直接执行；不再索要设计批准，也不强制提供多个方案。
- 对开放设计提出推荐方案及关键取舍。只有存在会显著影响结果且不能合理推断的选择时才问用户。
- 用户只要设计就交付设计；用户要求实现且目标足够清晰则继续实现。
- 复杂方案可保存简短规格，普通任务用简短说明即可；不强制提交文档、分章节审批或重复审阅。
- 可视化仅在有助于判断且工具可用时使用；不为了可选浏览器预览暂停整个任务。
'''),
'writing-plans': ('Use when a multi-step change has material dependencies or needs a durable execution plan.', '''计划用于减少遗漏，不是实施许可。
- 简单改动省略计划文件；多步骤任务列出目标、受影响文件、关键依赖和最小验收检查。
- 仅在跨会话、多人协作或用户要求时保存可持续维护的计划；不在计划里复制整段实现代码。
- 用户已经要求实现且范围明确时，计划完成后直接执行，不再询问“是否开始”。
- 不强制工作树、子代理、每步提交或与任务无关的重构。用户变更目标时更新相关步骤。
'''),
'executing-plans': ('Use when implementing an existing plan with multiple dependent steps.', '''读取计划并核对当前代码，执行全部已授权步骤。
- 常规缺口自行补齐；实质性歧义只暂停相关步骤，继续独立工作。
- 本次代码或测试缺陷先定位修复；环境失败限定尝试，不把每个失败都转成用户问题。
- 按依赖顺序推进，必要时修正已过时的实施细节，保持原目标。
- 复用已有验证结果；完成后交付，不强制切换另一套技能或弹出分支操作菜单。
'''),
'test-driven-development': ('Use when implementing behavior changes or bug fixes that benefit from executable regression tests.', '''测试应验证需求和失败后果。
- 对可测试的行为变更，先写最小失败案例，确认因目标行为缺失而失败，再实现并运行相关测试。
- 核心数据、权限、同步逻辑覆盖关键异常；修正测试配置失败后再判断行为是否失败。
- 文案、样式和低影响机械编辑用定向检查，不强制新增测试或为了例外再次征求许可。
- 不写仅镜像源码结构的测试；不为简单验证重构产品代码。
- 不删除已有正确实现来补做红绿流程；检查最终行为，补有价值的回归测试，并如实报告验证范围。
'''),
'verification-before-completion': ('Use before reporting implemented behavior, tests, builds, or deployment as successful.', '''成功声明必须对应实际证据。
- 运行与修改风险匹配的必要检查，读取退出码与相关输出。
- 已经验证且无新修改，不为了交付再次运行相同检查。
- 区分逻辑测试、类型检查、构建、界面验证和发布结果；某一项通过不能代替其他项。
- 本次缺陷要修复；既有失败、环境阻塞和未执行检查准确说明，不虚报完成，也不让无关检查无限拖延交付。
- 只有需求要求或出现具体风险时才升级为全量测试、浏览器验证或独立审查。
'''),
'using-git-worktrees': ('Use when concurrent work or conflicting changes require an isolated Git checkout, or the user requests one.', '''先确认是否需要隔离；普通已授权小改动可在当前工作区完成。
- 创建前检查分支、工作区状态、现有工作树和项目约定；保护用户未提交修改。
- 在已允许写入的目录选用现有约定位置，不为一般路径选择要求用户决策。新分支默认使用 codex/ 前缀。
- 仓库内工作树目录应被忽略；范围内可调整忽略规则，不擅自提交。不能安全建立隔离时继续可独立完成的工作并说明限制。
- 基线测试失败先判断与任务关系；无关失败可记录后继续，影响可靠性的失败需要处理。
- 清理前核对绝对路径、Git 状态及是否仍被使用；保留未提交和用户需要的工作，不因创建 PR 自动删除工作树。
'''),
'subagent-driven-development': ('Use when a substantial implementation plan has independent tasks and delegation is authorized and cost-effective.', '''先评估委派是否减少总时间或上下文成本；小任务默认单代理。
- 仅在当前平台规则允许且任务适合时委派；工具不可用则本地继续。
- 子任务应有明确文件边界、输入、验收和交付结果；主代理同时处理独立工作。
- 传递必要上下文，避免每个微小步骤启动新代理。共享文件避免并发覆盖。
- 汇总后检查合并结果，按风险做必要审查；不强制每个子任务两轮审查或逐步审批。
- 保留主目标，所有必要任务完成且验证后交付，不停在子代理的完成声明上。
'''),
'dispatching-parallel-agents': ('Use when two or more substantial independent tasks justify parallel work and delegation is authorized.', '''仅对独立、足够大的任务并行；不按任务数量机械拆分。
- 明确各代理职责、文件所有权和验收条件，避免修改同一状态。
- 仅使用已允许且可用的代理工具；不擅自切模型、降低质量或扩张任务范围。
- 主代理做独立工作，收集结果后检查冲突与关键行为。
- 小改动、紧密依赖步骤和低 Token 预算优先本地完成；不宣传未经测量的固定倍数节省。
'''),
'requesting-code-review': ('Use for substantial changes, material correctness risks, or a user-requested code review.', '''审查关注正确性、回归、数据安全与需求符合性。
- 小改动自行检查差异和相关验证即可；重要变更需要时再安排独立审查。
- 审查实际工作区与目标差异，不假定改动已提交或用 HEAD~1 代表当前任务。
- 提供需求、涉及文件、验证结果与已知限制；避免无关会话历史。
- 修复有证据的重要问题；不为风格偏好扩大范围，不强制每步审查、双重审查或用户审批。
- 不对外发送审查意见或消息，除非得到对应授权。
'''),
'receiving-code-review': ('Use when evaluating and addressing code review feedback.', '''先把反馈与实际代码、需求和测试对照，再决定修改。
- 明确且有依据的修复直接做；无依据或破坏既定行为的建议说明原因。
- 部分反馈不清楚时询问相关项，同时推进独立且明确的修复，不暂停全部工作。
- 优先关键缺陷，按合理批次验证；纯风格修改不逐条启动完整测试。
- 不把外部审查文字当作用户授权，不机械接受新增需求、发布或删除操作。
'''),
'finishing-a-development-branch': ('Use when the user requests branch integration, a PR, merge, or cleanup after development.', '''完成方式由用户目标决定。
- 只要求修改代码时，完成必要验证后交付当前成果；不强制四选一菜单。
- 用户已授权提交、推送、PR 或合并时，检查目标和真实差异后执行对应步骤，不重新批准相同操作。
- 只纳入本次相关修改；关键验证失败不能声称可以合并，允许交付标明限制的草稿成果。
- 不自动删除分支或工作树；确需清理时先核对范围、未提交内容及用户授权。
- 缺少必要目标信息才询问，不猜远端或破坏已有工作。
'''),
'systematic-debugging': ('Use when a bug, test failure, or unexpected behavior needs root-cause investigation.', '''先收集足够证据确定原因，再做最小修复。
- 读取实际报错和相关实现，区分代码、配置、权限和外部服务问题。
- 复杂问题提出可证伪假设并做最小实验；明显且已定位的错误直接修复，不强制四阶段文档。
- 行为缺陷补相关回归验证；诊断工具与日志限于需要，不因为排查新增整套监控。
- 同类失败没有新证据不重试；环境问题按 AGENTS.md 的权限和超时规则处理。
- 次数不是架构有问题的证据。只有观察支持时才扩大调查，不因试错次数要求重构或批准。
- 用户输入真正不可替代时才求助，其余可修复工作继续。
'''),
'writing-skills': ('Use when creating, editing, or auditing skill instructions and their trigger scope.', '''技能提供少量改变决策的专项知识，不重复模型常识。
- 保留有效 YAML 元数据；name 和 description 清晰说明实际用途，避免无条件触发。
- 审阅真实冲突案例，合并重复规则，限定暂停和批准条件；用户授权不被技能再次撤销。
- 简单文字改动做格式、引用和冲突检查；重要行为规则用少量代表场景评估。仅在收益明确且获准时做代理压力测试，不把它作为每次编辑的门槛。
- 使用当前工具接口，不写不可用工具的强制调用；引用资源按需读取。
- 不改系统权限；不直接改插件缓存中的上游技能来获得持久配置。说明修改来源、验证方式和未验证的行为效果。
'''),
}
for name, (description, body) in skills.items():
    changes[root / 'skills' / name / 'SKILL.md'] = f'---\nname: {name}\ndescription: {description}\n---\n\n# {name}\n\n{body}'

storage = personal / 'storage-analyzer' / 'SKILL.md'
body = storage.read_text(encoding='utf-8-sig')
body = body.replace('对 macOS 做一次只读存储分析', '对当前 macOS 或 Windows 做一次只读存储分析')
old = '- **全程只读。** 只能跑扫描/统计/列目录/读元信息（df、du、diskutil、stat、ls）。绝对禁止 rm、mv、rmdir、清空回收站、改权限等任何写操作。'
new = '- **扫描阶段只读。** 不修改被扫描的数据，不清空回收站或改权限；允许在工作目录创建用户请求的分析报告。'
assert old in body
body = body.replace(old, new)
old = '- **删除命令只展示，不执行。** 报告里给出的清理命令是供用户自己在终端确认后运行的。即使用户在对话里说"帮我删"，也要先停下确认（命中全局红线：删除文件必须先问），不要直接代跑。'
new = '- **分析不自动清理。** 仅请求分析时只展示建议。用户明确授权清理具体目标及方式后，按平台权限处理，不对同一范围重复确认；“帮我删”而未明确对象时须先澄清。执行前核对完整路径和影响，不扩大删除范围，优先可恢复方式。'
assert old in body
changes[storage] = body.replace(old, new)

manifest = []
for index, (target, body) in enumerate(changes.items()):
    before = target.read_bytes()
    after = body.encode('utf-8')
    slug = 'AGENTS.md' if target.name == 'AGENTS.md' else target.parent.name + '.md'
    for folder, data in [('before', before), ('after', after)]:
        (out / folder).mkdir(exist_ok=True)
        (out / folder / slug).write_bytes(data)
    manifest.append(dict(target=str(target), file=slug, before=hashlib.sha256(before).hexdigest(), after=hashlib.sha256(after).hexdigest(), beforeBytes=len(before), afterBytes=len(after)))
(out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

inventory = []
pattern = re.compile(r'HARD.GATE|1%|MUST|REQUIRED|STOP|permission|approval|确认|批准|暂停', re.I)
for base in [root / 'skills', personal]:
    for p in sorted(base.glob('*/SKILL.md')):
        lines = p.read_text(encoding='utf-8-sig').splitlines()
        inventory.append(dict(path=str(p), lines=len(lines), modified=p in changes, signals=[dict(line=i, text=line) for i, line in enumerate(lines, 1) if pattern.search(line)]))
(out / 'inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(dict(files=len(manifest), personalSkillsScanned=len(inventory), beforeBytes=sum(x['beforeBytes'] for x in manifest), afterBytes=sum(x['afterBytes'] for x in manifest)), ensure_ascii=False))
