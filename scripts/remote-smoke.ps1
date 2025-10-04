Param(
  [string]$Orch = $env:ORCH,
  [string]$Goal = 'remote smoke test',
  [switch]$NoStream
)

if (-not $Orch) {
  Write-Host '[ERR] ORCH env var not set. Use:  $env:ORCH="https://<your>.onrender.com"' -ForegroundColor Red
  exit 1
}

function Show-Step($name) { Write-Host "`n==== $name ====\n" -ForegroundColor Cyan }

function Invoke-Json($method, $url, $body) {
  try {
    if ($body) { return Invoke-RestMethod -Method $method -Uri $url -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress) }
    else { return Invoke-RestMethod -Method $method -Uri $url }
  }
  catch {
    Write-Host "[ERR] $method $url -> $($_.Exception.Message)" -ForegroundColor Red
    return $null
  }
}

Show-Step 'Health (wait up to 6s)'
$h = $null
for ($i=0; $i -lt 12; $i++) {
  $h = Invoke-Json GET "$Orch/health" $null
  if ($h -and $h.ok) { break }
  Start-Sleep -Milliseconds 500
}
if ($h -and $h.ok) { Write-Host 'Health OK'; Write-Host ($h | ConvertTo-Json -Depth 3) }
else { Write-Host '[FAIL] health not ok after retries' -ForegroundColor Red }

Show-Step 'Active Save'
$active = @{ taskId = 'REMOTE-SMOKE'; goal = $Goal; openQuestions=@(); pendingRisks=@(); nextSteps=@() }
$aResp = Invoke-Json POST "$Orch/memory/active" $active
Write-Host ($aResp | ConvertTo-Json -Depth 4)

Show-Step 'Hydrate'
$hyd = Invoke-Json GET ("$Orch/memory/hydrate?goal=" + [uri]::EscapeDataString($Goal)) $null
Write-Host ($hyd | ConvertTo-Json -Depth 4)

Show-Step 'Drive Sync'
$sync = Invoke-Json POST "$Orch/memory/sync" $null
Write-Host ($sync | ConvertTo-Json -Depth 4)

Show-Step 'Dev Council (POST)'
$councilBody = @{ prompt = 'Design remote quick note feature'; mode='design' }
$dc = Invoke-Json POST "$Orch/dev-council" $councilBody
if ($dc) { Write-Host ('finalSpecMd chars=' + ($dc.finalSpecMd.Length)) }

Show-Step 'Metrics Summary'
$m = Invoke-Json GET "$Orch/ai-usage/summary" $null
Write-Host ($m | ConvertTo-Json -Depth 4)

if (-not $NoStream) {
  Show-Step 'SSE Stream (10s)' 
  try {
    $streamUrl = "$Orch/dev-council/stream?prompt=" + [uri]::EscapeDataString('SSE remote quick plan')
    Write-Host "[INFO] curl.exe -N $streamUrl" -ForegroundColor DarkGray
    # Start curl, limit to 10s
    $job = Start-Job { param($u) curl.exe -N $u } -ArgumentList $streamUrl
    Start-Sleep -Seconds 10
    Stop-Job $job -ErrorAction SilentlyContinue
    Receive-Job $job | Select-Object -First 40 | ForEach-Object { $_ }
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
  catch { Write-Host "[WARN] SSE test failed: $($_.Exception.Message)" -ForegroundColor Yellow }
}

Write-Host "`n[SUMMARY]" -ForegroundColor Green
Write-Host ( @{ health = $h; activeSaved = [bool]$aResp.ok; hydrateCards = ($hyd.cards | Measure-Object).Count; metricsRows = ($m.summary | Measure-Object).Count } | ConvertTo-Json -Depth 4 )
Write-Host "Remote smoke done." -ForegroundColor Green
