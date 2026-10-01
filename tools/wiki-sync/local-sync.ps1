# Runs the wiki sync from this PC and publishes it - what .github/workflows/wiki-sync.yml did on GitHub, until
# wiki.projectdiablo2.com (Miraheze, behind Cloudflare) started answering GitHub's runners with HTTP 403. The same
# requests from a home connection go through.
#
# Run by the Windows scheduled task "PD2 Wiki sync" once a day (and at the next logon when the PC was off), or by hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\wiki-sync\local-sync.ps1 [-Full]
# Log: tools\wiki-sync\local-sync.log (last 500 lines kept; not committed).
param([switch]$Full)
$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$log = Join-Path $PSScriptRoot 'local-sync.log'
function Say($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m" | Tee-Object -FilePath $log -Append | Out-Host }
function Git { & git -C $repo @args; if ($LASTEXITCODE) { throw "git $args failed ($LASTEXITCODE)" } }

try {
  Say 'sync start'
  Git pull --rebase --quiet
  if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) { & npm ci --prefix $PSScriptRoot --silent; if ($LASTEXITCODE) { throw 'npm ci failed' } }
  # the sync writes its one-line summary to $GITHUB_OUTPUT, as on GitHub
  $out = New-TemporaryFile
  $env:GITHUB_OUTPUT = $out.FullName
  $args2 = @((Join-Path $PSScriptRoot 'sync.mjs')); if ($Full) { $args2 += '--full' }
  & node @args2 2>&1 | ForEach-Object { Say "  $_" }
  if ($LASTEXITCODE) { throw "sync.mjs failed ($LASTEXITCODE)" }
  $summary = (Get-Content $out.FullName | Where-Object { $_ -like 'summary=*' } | Select-Object -First 1) -replace '^summary=', ''
  Remove-Item $out.FullName -ErrorAction SilentlyContinue
  Git add wiki/data
  & git -C $repo diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Say 'nothing changed on the wiki'; return }
  if (-not $summary) { $summary = 'refresh' }
  Git commit --quiet -m "Wiki sync: $summary" -m 'Run from the local scheduled task (tools/wiki-sync/local-sync.ps1).'
  Git push --quiet
  Say "pushed: $summary"
} catch {
  Say "FAILED: $_"
  exit 1
} finally {
  if (Test-Path $log) { $l = Get-Content $log; if ($l.Count -gt 500) { $l[-500..-1] | Set-Content $log } }
}
