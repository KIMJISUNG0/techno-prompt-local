# 🔗 VS Code ↔ Google Colab 연동 가이드

VS Code에서 Google Colab과 효과적으로 연동하는 방법을 안내합니다.

## 🚀 **빠른 시작**

### 1. 환경 설정 (최초 한 번만)

```bash
# Python 환경 설정
npm run colab:setup

# 또는 VS Code에서
# Ctrl+Shift+P → "Tasks: Run Task" → "🔗 Colab: Setup Environment"
```

### 2. 음악 분석 노트북 생성

```bash
# 새 노트북 생성
npm run colab:create music_analysis_demo

# 또는 VS Code에서
# Ctrl+Shift+P → "Tasks: Run Task" → "📓 Colab: Create Music Analysis Notebook"
```

### 3. 로컬 Jupyter 실행 (코랩과 유사한 환경)

```bash
npm run colab:jupyter

# 또는 VS Code에서
# Ctrl+Shift+P → "Tasks: Run Task" → "🚀 Colab: Launch Local Jupyter"
```

## 🔄 **연동 방법들**

### **방법 1: GitHub 동기화 (권장)**

가장 안정적이고 자동화된 방법입니다.

1. **VS Code에서 노트북 생성/편집**

   ```bash
   npm run colab:create my_analysis
   ```

2. **Git에 커밋 & 푸시**

   ```bash
   git add analysis/my_analysis.ipynb
   git commit -m "Add music analysis notebook"
   git push origin main
   ```

3. **코랩에서 GitHub 링크로 열기**
   ```
   https://colab.research.google.com/github/KIMJISUNG0/techno-prompt-local/blob/main/analysis/my_analysis.ipynb
   ```

### **방법 2: 로컬 Jupyter + 수동 동기화**

VS Code에서 직접 노트북을 실행하고 필요할 때만 코랩으로 복사합니다.

1. **로컬 Jupyter Lab 실행**

   ```bash
   npm run colab:jupyter
   ```

2. **VS Code Jupyter Extension으로 편집**
   - `.ipynb` 파일을 VS Code에서 직접 열기
   - 셀 실행, 편집, 디버깅 가능

3. **코랩으로 복사** (GPU/TPU 필요 시)
   - 파일 → 업로드 → 코랩에서 실행

### **방법 3: Google Drive 동기화**

코랩 파일을 Google Drive에 저장하고 로컬과 동기화합니다.

1. **Google Drive 데스크톱 설치**
2. **코랩 노트북을 Drive에 저장**
3. **로컬 Drive 폴더와 프로젝트 심볼릭 링크**

## 🎵 **음악 분석 워크플로**

### **시나리오 1: 빠른 프로토타이핑**

```
VS Code (노트북 작성)
    ↓
로컬 Jupyter (기본 테스트)
    ↓
GitHub 푸시
    ↓
Colab (GPU 가속 분석)
    ↓
결과를 GCP Storage에 저장
    ↓
React 앱에서 시각화
```

### **시나리오 2: 대용량 분석**

```
VS Code (분석 스크립트 작성)
    ↓
Colab Pro (GPU/TPU + 고RAM)
    ↓
Drive 자동 백업
    ↓
결과 다운로드 → VS Code
```

## 🛠️ **설치된 도구들**

### **VS Code Extensions**

- ✅ **Jupyter**: 노트북 편집/실행
- ✅ **Python**: Python 개발 환경
- ✅ **GitHub Copilot**: AI 코드 지원

### **Python 패키지** (자동 설치됨)

```python
# 음악 분석
librosa          # 오디오 처리
matplotlib       # 시각화
numpy, pandas    # 데이터 처리

# Google 연동
google-colab     # 코랩 호환성
google-cloud-*   # GCP 서비스

# Jupyter
jupyterlab       # 로컬 노트북 환경
```

## 🎯 **실제 사용 예시**

### **1. BPM 분석 노트북**

```python
# VS Code에서 생성한 노트북
import librosa
import numpy as np

# 로컬에서 기본 테스트
y, sr = librosa.load('sample.wav')
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
print(f"BPM: {tempo}")

# 코랩에서 GPU 가속 처리
# (더 복잡한 분석)
```

### **2. 장르 분류 모델**

```python
# VS Code에서 모델 코드 작성
# ↓ GitHub 동기화
# ↓ 코랩에서 GPU 학습
# ↓ 결과를 GCP에 저장
# ↓ React 앱에서 활용
```

## 🔧 **고급 설정**

### **Colab 단축키 추가**

VS Code에서 `Ctrl+Shift+P` → 다음 명령어들:

- **Tasks: Run Task** → 🔗 Colab: Setup Environment
- **Tasks: Run Task** → 📓 Colab: Create Music Analysis Notebook
- **Tasks: Run Task** → 🚀 Colab: Launch Local Jupyter
- **Tasks: Run Task** → 🔄 Colab: Sync to GitHub

### **자동 동기화 설정**

`.vscode/settings.json`에 추가:

```json
{
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/.git/objects/**": true,
    "**/.git/subtree-cache/**": true,
    "**/analysis/.ipynb_checkpoints/**": true
  },
  "jupyter.interactiveWindow.textEditor.executeSelection": true,
  "jupyter.sendSelectionToInteractiveWindow": true
}
```

## 💡 **팁 & 트릭**

### **1. 코랩 GPU 최적화**

```python
# GPU 사용률 확인
!nvidia-smi

# 메모리 정리
import gc
gc.collect()

# 배치 크기 조정
batch_size = 32 if torch.cuda.is_available() else 8
```

### **2. VS Code 디버깅**

- 브레이크포인트 설정
- 변수 inspector
- 스텝별 실행

### **3. 버전 관리**

```bash
# 노트북 출력 제거 (git 커밋 전)
jupyter nbconvert --clear-output --inplace analysis/*.ipynb

# .gitignore에 추가
echo "analysis/.ipynb_checkpoints/" >> .gitignore
```

## ❓ **FAQ**

**Q: VS Code에서 직접 코랩에 접속할 수 있나요?**
A: 직접 접속은 불가능하지만, GitHub 동기화로 seamless한 워크플로가 가능합니다.

**Q: 로컬 Jupyter vs Colab 언제 쓰나요?**
A:

- 로컬: 빠른 테스트, 디버깅, 작은 데이터
- 코랩: GPU 필요, 대용량 데이터, 긴 학습

**Q: 코랩 무료 GPU 한도가 걱정됩니다.**
A: 로컬에서 최대한 개발하고, 최종 실행만 코랩에서 하세요. GCP 크레딧도 활용 가능합니다.

---

🎵 **이제 VS Code와 Colab을 자유롭게 오가며 음악 분석을 즐기세요!** 🚀
