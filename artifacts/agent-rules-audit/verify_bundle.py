from pathlib import Path
import hashlib, json, re, shutil, subprocess, tempfile

bundle = Path(__file__).resolve().parent
entries = json.loads((bundle / 'manifest.json').read_text(encoding='utf-8'))
assert len(entries) == 16
for entry in entries:
    for version in ('before', 'after'):
        data = (bundle / version / entry['file']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry[version]
    text = (bundle / 'after' / entry['file']).read_text(encoding='utf-8')
    if entry['file'] != 'AGENTS.md':
        assert text.startswith('---\n') and re.search(r'^name: .+$', text, re.M) and re.search(r'^description:', text, re.M)
    if entry['file'] != 'storage-analyzer.md':
        assert '<HARD-GATE>' not in text and 'REQUIRED SUB-SKILL' not in text

shell = shutil.which('pwsh') or shutil.which('powershell')
assert shell, 'PowerShell required for installer verification'
# Exercise the real installer against isolated copies, never live settings.
with tempfile.TemporaryDirectory(prefix='agent-rule-check-') as work:
    work = Path(work)
    fake = work / 'codex'
    stage = work / 'bundle'
    stage.mkdir()
    for folder in ('before', 'after'):
        shutil.copytree(bundle / folder, stage / folder)
    fake_entries = []
    for entry in entries:
        target = fake / 'AGENTS.md' if entry['file'] == 'AGENTS.md' else fake / 'skills' / entry['file'][:-3] / 'SKILL.md'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((bundle / 'before' / entry['file']).read_bytes())
        fake_entries.append({**entry, 'target': str(target)})
    (stage / 'manifest.json').write_text(json.dumps(fake_entries, ensure_ascii=False), encoding='utf-8')
    script = (bundle / 'install.ps1').read_text(encoding='utf-8')
    script = script.replace("'D:\\0-Codex\\CodexData'", "'" + str(fake).replace("'", "''") + "'")
    (stage / 'install.ps1').write_text(script, encoding='utf-8-sig')
    def run(mode, success=True):
        result = subprocess.run([shell, '-NoProfile', '-File', str(stage / 'install.ps1'), '-Mode', mode], capture_output=True, timeout=30)
        assert (result.returncode == 0) == success, result.stdout + result.stderr
    run('Check')
    run('Apply')
    for entry in fake_entries:
        assert hashlib.sha256(Path(entry['target']).read_bytes()).hexdigest() == entry['after']
    run('Apply')  # Idempotent.
    run('Restore')
    for entry in fake_entries:
        assert hashlib.sha256(Path(entry['target']).read_bytes()).hexdigest() == entry['before']
    changed = Path(fake_entries[-1]['target'])
    changed.write_bytes(b'new user edit')
    run('Apply', success=False)  # All-target preflight prevents partial application.
    assert changed.read_bytes() == b'new user edit'
    for entry in fake_entries[:-1]:
        assert hashlib.sha256(Path(entry['target']).read_bytes()).hexdigest() == entry['before']

before = sum(entry['beforeBytes'] for entry in entries)
after = sum(entry['afterBytes'] for entry in entries)
result = f'''# 验证记录

- 16个改稿与原版SHA256核对通过。
- 技能入口必需元数据和主要冲突词检查通过。
- 安装器在隔离副本上通过：只读检查、应用、逐文件回读、重复应用、恢复原版、后续编辑保护（拒绝覆盖且无部分写入）。
- 实际目标安装状态由执行 install.ps1 -Mode Apply 的结果决定；本测试不修改全局文件。
- 合计UTF-8字节数：{before} → {after}，减少{(1-after/before)*100:.1f}%。这是文件体积变化，不是实际Token或模型效果测量。
- 未运行模型压力测试，不声明固定Token节省或行为遵从率。
'''
(bundle / '验证记录.md').write_text(result, encoding='utf-8')
print('PASS: snapshots, metadata, installer apply/idempotence/restore/drift protection. Bytes:', before, '->', after)
