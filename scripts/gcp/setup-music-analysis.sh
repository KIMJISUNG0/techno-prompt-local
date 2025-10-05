#!/bin/bash
# GCP 음악 분석 프로젝트 초기 설정 스크립트

echo "🎵 Techno Prompt - GCP 음악 분석 환경 설정"
echo "================================================"

# 프로젝트 ID 설정 (사용자 입력)
read -p "GCP 프로젝트 ID를 입력하세요 (예: techno-prompt-2025): " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo "❌ 프로젝트 ID가 필요합니다."
    exit 1
fi

echo "📋 프로젝트 설정: $PROJECT_ID"

# 1. 프로젝트 생성 및 설정
echo "1️⃣ 프로젝트 생성 중..."
gcloud projects create $PROJECT_ID --name="Techno Prompt Music Analysis"
gcloud config set project $PROJECT_ID

# 2. 결제 계정 연결 (무료 크레딧 활성화용)
echo "2️⃣ 결제 계정 연결이 필요합니다 (무료 크레딧 활성화용):"
echo "   👉 https://console.cloud.google.com/billing"
echo "   계속하려면 Enter를 누르세요..."
read

# 3. 필수 API 활성화
echo "3️⃣ 음악 분석용 API 활성화 중..."
gcloud services enable appengine.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable firestore.googleapis.com
gcloud services enable cloudrun.googleapis.com
gcloud services enable aiplatform.googleapis.com  # Vertex AI
gcloud services enable speech.googleapis.com       # Speech-to-Text
gcloud services enable translate.googleapis.com    # Translation API

# 4. App Engine 초기화 (정적 호스팅용)
echo "4️⃣ App Engine 초기화..."
gcloud app create --region=asia-northeast1

# 5. Cloud Storage 버킷 생성 (음악 파일 저장용)
echo "5️⃣ 음악 분석용 Storage 버킷 생성..."
BUCKET_NAME="${PROJECT_ID}-music-storage"
gsutil mb -l asia-northeast1 gs://$BUCKET_NAME

# 버킷 권한 설정 (공개 읽기 허용)
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME

# 6. Firestore 데이터베이스 생성
echo "6️⃣ Firestore 데이터베이스 초기화..."
gcloud firestore databases create --region=asia-northeast1

# 7. 서비스 계정 생성 (Colab 연동용)
echo "7️⃣ Colab 연동용 서비스 계정 생성..."
SERVICE_ACCOUNT="colab-bridge@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create colab-bridge \
    --display-name="Colab Integration Service Account" \
    --description="For connecting Google Colab to GCP services"

# 서비스 계정 권한 부여
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/datastore.user"

# 서비스 계정 키 생성
echo "8️⃣ 서비스 계정 키 생성..."
gcloud iam service-accounts keys create ./service-account.json \
    --iam-account=$SERVICE_ACCOUNT

# 8. 환경 변수 파일 생성
echo "9️⃣ 환경 변수 설정 파일 생성..."
cat > .env << EOF
# GCP 설정 (자동 생성됨)
GCP_PROJECT_ID=$PROJECT_ID
GCP_STORAGE_BUCKET=$BUCKET_NAME
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

# Colab 연동
COLAB_ANALYSIS_ENABLED=true
COLAB_AUTO_SYNC=true

# 기존 설정 유지
ORCH_ALLOW_NO_REDIS=1
ALLOW_MOCK_AI=1
EOF

echo "✅ GCP 음악 분석 환경 설정 완료!"
echo ""
echo "📋 생성된 리소스:"
echo "   🏗️  프로젝트: $PROJECT_ID"
echo "   🪣  Storage: $BUCKET_NAME"
echo "   🔑  서비스 계정: $SERVICE_ACCOUNT"
echo "   📄  키 파일: ./service-account.json"
echo ""
echo "🔄 다음 단계:"
echo "   1. npm run gcp:deploy (첫 배포)"
echo "   2. Colab에서 service-account.json 업로드"
echo "   3. npm run gcp:colab:generate (Colab 코드 생성)"
echo ""
echo "💰 무료 한도 (월별):"
echo "   📦 Cloud Storage: 5GB"
echo "   🔥 Firestore: 1GB, 50K reads/writes"
echo "   🏃 Cloud Run: 2M 요청, 180K vCPU-초"
echo "   🤖 Vertex AI: $200 크레딧 (3개월)"