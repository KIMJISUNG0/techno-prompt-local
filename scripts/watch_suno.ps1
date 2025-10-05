<#
  watch_suno.ps1 - Suno(또는 유사 AI 음악 서비스)에서 방금 내려받은 mp3/wav 파일을
  1) 구글드라이브 동기화 INBOX 폴더로 복사
  2) 표준 prefix + __vN 규칙으로 이름 부여
  3) 동일 prefix + __vN.prompt.txt 생성 (프롬프트 텍스트 기록)

  기본 사용 흐름:
    1. Wizard Step5에서 "파일 Prefix 복사" 후 아래로 -SetPrefix 실행
    2. 프롬프트 텍스트를 -SetPrompt 로 저장
    3. -Run 실행 후 Suno 다운로드 → 자동 v1 / v2 ... 이름으로 INBOX 저장

  설정/상태는 %USERPROFILE%\.techno-suno\config.json 에 저장

  예시:
    powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -Setup
    powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -SetPrefix "20251005T084338Z__long__e27274f__106bpm"
    powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -SetPrompt (Get-Content .\final_prompt.txt -Raw)
    powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -Run

  주의:
    - Suno 가 mp3, wav 을 거의 동시에 떨어뜨리면 각 확장자가 다른 v 번호가 될 수 있습니다.
      (v1.mp3, v2.wav)  → 한 세트로 묶고 싶다면 두 포맷 중 하나만 사용하거나 후처리 스크립트를 사용하세요.
    - 완전 표준 파일명 (prefix + 확장자) 이어야 하는 파이프라인이라면 Export 후
      별도 rename 스크립트에서 v 접미사를 제거하거나 새 prefix 로 재할당.
#>
param(
  [switch]$Run,
  [switch]$Setup,
  [string]$SetPrefix,
  [string]$SetPrompt
)

$ConfigPath = Join-Path $env:USERPROFILE ".techno-suno/config.json"

function Save-Config($cfg){
  New-Item -ItemType Directory -Force (Split-Path $ConfigPath) | Out-Null
  ($cfg | ConvertTo-Json -Depth 6) | Set-Content -Encoding UTF8 $ConfigPath
}
function Load-Config(){ if(Test-Path $ConfigPath){ (Get-Content $ConfigPath -Raw | ConvertFrom-Json) } else { $null } }
function Wait-FileReady([string]$p){
  for($i=0;$i -lt 80;$i++){ # 최대 약 20초
    try{ $fs=[IO.File]::Open($p,'Open','Read','None'); $fs.Close(); return } catch { Start-Sleep -Milliseconds 250 }
  }
}
function Process-File([string]$src){
  $cfg = Load-Config
  if(-not $cfg){ Write-Host "⚠ config 없음: 먼저 -Setup로 설정하세요."; return }
  $ext = ([IO.Path]::GetExtension($src)).ToLower()
  if($ext -notin @('.mp3','.wav')){ return }
  Wait-FileReady $src

  $v = [int]$cfg.version
  $destAudio  = Join-Path $cfg.INBOX ("{0}__v{1}{2}" -f $cfg.prefix,$v,$ext)
  $destPrompt = Join-Path $cfg.INBOX ("{0}__v{1}.prompt.txt" -f $cfg.prefix,$v)

  try {
    Copy-Item $src $destAudio -Force
    Set-Content -Path $destPrompt -Value $cfg.prompt -Encoding UTF8
    Write-Host ("✅ {0} → {1}" -f (Split-Path $src -Leaf), (Split-Path $destAudio -Leaf)) -ForegroundColor Green
    $cfg.version = $v + 1
    Save-Config $cfg
  } catch {
    Write-Host "❌ 복사 실패: $src -> $destAudio : $_" -ForegroundColor Red
  }
}

if($Setup){
  $defaultInbox = Join-Path $env:USERPROFILE "Google Drive/My Drive/TECHNO_PROMPT_MEMORY/memory/audio"
  $cfg = @{
    INBOX      = Read-Host "INBOX 경로 입력(기본: $defaultInbox)"
    DOWNLOADS  = Read-Host "다운로드 폴더 경로(기본: $env:USERPROFILE\Downloads)"
    prefix     = Read-Host "파일 Prefix (Wizard '파일 Prefix 복사' 값 붙여넣기)"
    prompt     = Read-Host "프롬프트 텍스트(한 줄 또는 임시)"
    version    = 1
  }
  if([string]::IsNullOrWhiteSpace($cfg.INBOX)){ $cfg.INBOX = $defaultInbox }
  if([string]::IsNullOrWhiteSpace($cfg.DOWNLOADS)){ $cfg.DOWNLOADS = "$env:USERPROFILE\Downloads" }
  New-Item -ItemType Directory -Force $cfg.INBOX | Out-Null
  Save-Config $cfg
  Write-Host "✔ 설정 저장: $ConfigPath" -ForegroundColor Cyan
  return
}

if($SetPrefix){
  $cfg=Load-Config; if(!$cfg){ Write-Host "⚠ 먼저 -Setup"; exit }
  $cfg.prefix=$SetPrefix; $cfg.version=1; Save-Config $cfg
  Write-Host "✔ Prefix 업데이트 & 버전=1" -ForegroundColor Cyan
}
if($SetPrompt){
  $cfg=Load-Config; if(!$cfg){ Write-Host "⚠ 먼저 -Setup"; exit }
  $cfg.prompt=$SetPrompt; Save-Config $cfg
  Write-Host "✔ Prompt 업데이트" -ForegroundColor Cyan
}

if($Run){
  $cfg=Load-Config; if(!$cfg){ Write-Host "⚠ 먼저 -Setup"; exit }
  Write-Host "👀 Watching '$($cfg.DOWNLOADS)' → INBOX '$($cfg.INBOX)'" -ForegroundColor Yellow
  Write-Host "    prefix: $($cfg.prefix) | start ver: $($cfg.version)" -ForegroundColor DarkGray
  $w1=New-Object IO.FileSystemWatcher $cfg.DOWNLOADS, '*.mp3'
  $w2=New-Object IO.FileSystemWatcher $cfg.DOWNLOADS, '*.wav'
  foreach($w in @($w1,$w2)){
    $w.IncludeSubdirectories = $false
    $w.EnableRaisingEvents   = $true
    Register-ObjectEvent $w Created -SourceIdentifier "suno_$([guid]::NewGuid())" -Action {
      Process-File $Event.SourceEventArgs.FullPath
    } | Out-Null
  }
  Write-Host "⏱ 실행 중… Ctrl+C 로 종료" -ForegroundColor Yellow
  while($true){ Start-Sleep 1 }
}
