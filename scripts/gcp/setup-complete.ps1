# GCP 설정 스크립트 (PowerShell 비대화형 버전)

$PROJECT_ID = "gen-lang-client-0423649345"
$REGION = "us-central1"

Write-Host "🚀 GCP Techno Prompt 프로젝트 설정 시작..." -ForegroundColor Green

# 1. 프로젝트 설정
Write-Host "📋 프로젝트 설정: $PROJECT_ID" -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# 2. 인증 확인
Write-Host "🔐 인증 상태 확인..." -ForegroundColor Yellow
$activeAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)"
Write-Host "✅ 활성 계정: $activeAccount" -ForegroundColor Green

# 3. Billing 상태 확인
Write-Host "💳 Billing 상태 확인..." -ForegroundColor Yellow
$billingEnabled = gcloud beta billing projects describe $PROJECT_ID --format="value(billingEnabled)"
if ($billingEnabled -ne "True") {
    Write-Host "❌ Billing이 활성화되지 않았습니다." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Billing 활성화됨" -ForegroundColor Green

# 4. Storage 버킷 생성
Write-Host "🪣 Storage 버킷 설정..." -ForegroundColor Yellow
$BUCKET_NAME = "$PROJECT_ID-music-storage"
$bucketExists = $false
try {
    gsutil ls -b gs://$BUCKET_NAME | Out-Null
    $bucketExists = $true
} catch {
    # 버킷이 없음
}

if (-not $bucketExists) {
    gsutil mb -l $REGION gs://$BUCKET_NAME
    Write-Host "✅ Storage 버킷 생성 완료: gs://$BUCKET_NAME" -ForegroundColor Green
} else {
    Write-Host "✅ Storage 버킷 이미 존재함: gs://$BUCKET_NAME" -ForegroundColor Green
}

# 5. 최종 확인
Write-Host "🎯 설정 완료!" -ForegroundColor Green
Write-Host "📋 프로젝트: $PROJECT_ID" -ForegroundColor Cyan
Write-Host "🌍 리전: $REGION" -ForegroundColor Cyan
Write-Host "🪣 Storage: gs://$BUCKET_NAME" -ForegroundColor Cyan

Write-Host ""
Write-Host "🎉 GCP 설정이 완료되었습니다!" -ForegroundColor Green
Write-Host "이제 다음 명령어로 배포할 수 있습니다:" -ForegroundColor Yellow
Write-Host "  npm run gcp:deploy:run" -ForegroundColor White
Write-Host "  또는" -ForegroundColor White
Write-Host "  gcloud builds submit --region=$REGION --config=cloudbuild.yaml ." -ForegroundColor White