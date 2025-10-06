#!/bin/bash
# GCP 설정 스크립트 (비대화형 버전)
# 모든 대화형 입력을 제거하고 자동화

set -e  # 오류 시 즉시 종료

PROJECT_ID="gen-lang-client-0423649345"
REGION="us-central1"
APP_ENGINE_REGION="us-central"

echo "🚀 GCP Techno Prompt 프로젝트 설정 시작..."

# 1. 프로젝트 설정 확인
echo "📋 프로젝트 설정: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# 2. 인증 확인
echo "🔐 인증 상태 확인..."
gcloud auth list --filter=status:ACTIVE --format="value(account)"

# 3. Billing 상태 확인
echo "💳 Billing 상태 확인..."
BILLING_ENABLED=$(gcloud beta billing projects describe $PROJECT_ID --format="value(billingEnabled)")
if [ "$BILLING_ENABLED" != "True" ]; then
    echo "❌ Billing이 활성화되지 않았습니다. Google Cloud Console에서 활성화해주세요."
    exit 1
fi
echo "✅ Billing 활성화됨"

# 4. 필수 API 활성화
echo "🔧 필수 API들 활성화..."
gcloud services enable \
    compute.googleapis.com \
    run.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    storage.googleapis.com \
    firestore.googleapis.com \
    aiplatform.googleapis.com \
    appengine.googleapis.com \
    --quiet

echo "⏳ API 활성화 완료 대기 중..."
sleep 30  # API 활성화 완료 대기

# 5. App Engine 생성 (이미 존재하면 건너뛰기)
echo "🏗️ App Engine 설정..."
if ! gcloud app describe >/dev/null 2>&1; then
    gcloud app create --region=$APP_ENGINE_REGION --quiet
    echo "✅ App Engine 생성 완료"
else
    echo "✅ App Engine 이미 존재함"
fi

# 6. Firestore 생성 (이미 존재하면 건너뛰기)
echo "🗄️ Firestore 설정..."
if ! gcloud firestore databases describe --format="value(name)" >/dev/null 2>&1; then
    gcloud firestore databases create --location=nam5 --type=firestore-native --quiet
    echo "✅ Firestore 생성 완료"
else
    echo "✅ Firestore 이미 존재함"
fi

# 7. Artifact Registry 생성
echo "📦 Artifact Registry 설정..."
if ! gcloud artifacts repositories describe app-repo --location=$REGION >/dev/null 2>&1; then
    gcloud artifacts repositories create app-repo \
        --repository-format=docker \
        --location=$REGION \
        --description="Techno Prompt app images" \
        --quiet
    echo "✅ Artifact Registry 생성 완료"
else
    echo "✅ Artifact Registry 이미 존재함"
fi

# 8. Storage 버킷 생성
echo "🪣 Storage 버킷 설정..."
BUCKET_NAME="$PROJECT_ID-music-storage"
if ! gsutil ls -b gs://$BUCKET_NAME >/dev/null 2>&1; then
    gsutil mb -l $REGION gs://$BUCKET_NAME
    echo "✅ Storage 버킷 생성 완료: gs://$BUCKET_NAME"
else
    echo "✅ Storage 버킷 이미 존재함: gs://$BUCKET_NAME"
fi

# 9. IAM 역할 설정
echo "🔐 IAM 역할 설정..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUDBUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

# Cloud Build 서비스 계정에 필요한 권한 부여
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/run.admin" \
    --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/iam.serviceAccountUser" \
    --quiet

echo "✅ IAM 역할 설정 완료"

# 10. 최종 확인
echo "🎯 설정 완료 확인..."
echo "📋 프로젝트: $PROJECT_ID"
echo "🌍 리전: $REGION"
echo "🔗 App Engine: https://$PROJECT_ID.appspot.com"
echo "📦 Artifact Registry: us-central1-docker.pkg.dev/$PROJECT_ID/app-repo"
echo "🪣 Storage: gs://$BUCKET_NAME"

echo ""
echo "🎉 GCP 설정이 완료되었습니다!"
echo "이제 다음 명령어로 배포할 수 있습니다:"
echo "  npm run gcp:deploy"
echo "  또는"
echo "  gcloud builds submit --region=$REGION --config=cloudbuild.yaml ."
