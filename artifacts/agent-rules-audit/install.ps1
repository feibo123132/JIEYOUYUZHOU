param([ValidateSet('Check', 'Apply', 'Restore')][string]$Mode = 'Check')
$ErrorActionPreference = 'Stop'
$taskManifest = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json)
$taskCodexRoot = [IO.Path]::GetFullPath('D:\0-Codex\CodexData')
$taskStorage = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.agents\skills\storage-analyzer\SKILL.md'))
$taskSeen = @{}
$taskPending = @()

function Get-TaskHash([string]$Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# Validate every target and snapshot before making any changes.
foreach ($taskEntry in $taskManifest) {
    $taskTarget = [IO.Path]::GetFullPath($taskEntry.target)
    $taskSkillPattern = '^' + [regex]::Escape($taskCodexRoot) + '\\skills\\[a-z0-9-]+\\SKILL\.md$'
    if ($taskTarget -ne (Join-Path $taskCodexRoot 'AGENTS.md') -and $taskTarget -ne $taskStorage -and $taskTarget -notmatch $taskSkillPattern) { throw "Target outside reviewed scope: $taskTarget" }
    if ($taskSeen.ContainsKey($taskTarget)) { throw "Duplicate target: $taskTarget" }
    $taskSeen[$taskTarget] = $true
    if ([IO.Path]::GetFileName($taskEntry.file) -ne $taskEntry.file) { throw 'Invalid snapshot name' }
    foreach ($taskVersion in @('before', 'after')) {
        $taskSnapshot = Join-Path (Join-Path $PSScriptRoot $taskVersion) $taskEntry.file
        if ((Get-TaskHash $taskSnapshot) -ne $taskEntry.$taskVersion) { throw "Snapshot changed: $taskSnapshot" }
    }
    $taskHash = Get-TaskHash $taskTarget
    if ($taskHash -ne $taskEntry.before -and $taskHash -ne $taskEntry.after) { throw "File changed since audit; no files written: $taskTarget" }
    $taskDesired = if ($Mode -eq 'Restore') { 'before' } else { 'after' }
    if ($taskHash -ne $taskEntry.$taskDesired) { $taskPending += $taskEntry }
}

if ($Mode -eq 'Check') {
    Write-Output "CHECK OK: $($taskManifest.Count) verified files; $($taskPending.Count) pending updates."
    exit 0
}

$taskApplied = @()
try {
    foreach ($taskEntry in $taskPending) {
        $taskOriginal = if ($Mode -eq 'Restore') { 'after' } else { 'before' }
        $taskDesired = if ($Mode -eq 'Restore') { 'before' } else { 'after' }
        if ((Get-TaskHash $taskEntry.target) -ne $taskEntry.$taskOriginal) { throw "Concurrent edit detected: $($taskEntry.target)" }
        $taskApplied += $taskEntry
        $taskPayload = Join-Path (Join-Path $PSScriptRoot $taskDesired) $taskEntry.file
        [IO.File]::WriteAllBytes($taskEntry.target, [IO.File]::ReadAllBytes($taskPayload))
        if ((Get-TaskHash $taskEntry.target) -ne $taskEntry.$taskDesired) { throw "Write verification failed: $($taskEntry.target)" }
    }
} catch {
    $taskFailure = $_
    foreach ($taskEntry in $taskApplied) {
        $taskOriginal = if ($Mode -eq 'Restore') { 'after' } else { 'before' }
        $taskBackup = Join-Path (Join-Path $PSScriptRoot $taskOriginal) $taskEntry.file
        try { [IO.File]::WriteAllBytes($taskEntry.target, [IO.File]::ReadAllBytes($taskBackup)) }
        catch { Write-Warning "Rollback failed: $($taskEntry.target). Original snapshots remain in the bundle." }
    }
    throw $taskFailure
}
Write-Output "$Mode OK: $($taskPending.Count) files updated and hash-verified. Snapshots: $PSScriptRoot"
