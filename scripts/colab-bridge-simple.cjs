/**
 * VS Code ↔ Google Colab 브리지 (간단 버전)
 * 즉시 사용 가능한 Node.js 기반 코랩 연동 도구
 */

const fs = require('fs').promises;
const path = require('path');

async function createMusicAnalysisNotebook(name) {
  console.log(`📓 음악 분석 노트북 생성: ${name}`);

  const notebookContent = {
    "nbformat": 4,
    "nbformat_minor": 0,
    "metadata": {
      "colab": {
        "provenance": [],
        "gpuType": "T4"
      },
      "kernelspec": {
        "name": "python3",
        "display_name": "Python 3"
      },
      "language_info": {
        "name": "python"
      },
      "accelerator": "GPU"
    },
    "cells": [
      {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
          "# 🎵 음악 분석 노트북\\n",
          "VS Code에서 생성된 코랩 호환 노트북\\n",
          "\\n",
          "## 🚀 빠른 시작\\n",
          "1. 런타임 → GPU 변경\\n",
          "2. 구글 드라이브 마운트\\n",
          "3. 음악 파일 업로드 후 분석 실행"
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "# 🔧 환경 설정\\n",
          "!pip install librosa matplotlib numpy pandas\\n",
          "\\n",
          "# 구글 드라이브 마운트\\n",
          "from google.colab import drive\\n",
          "drive.mount('/content/drive')"
        ]
      },
      {
        "cell_type": "code", 
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "# 🎵 음악 분석 함수\\n",
          "import librosa\\n",
          "import numpy as np\\n",
          "import matplotlib.pyplot as plt\\n",
          "\\n",
          "def analyze_music(file_path):\\n",
          "    print(f'🎵 분석 시작: {file_path}')\\n",
          "    \\n",
          "    # 오디오 로드\\n",
          "    y, sr = librosa.load(file_path, duration=60)\\n",
          "    \\n",
          "    # BPM 분석\\n",
          "    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)\\n",
          "    print(f'🥁 BPM: {tempo:.1f}')\\n",
          "    \\n",
          "    # 시각화\\n",
          "    plt.figure(figsize=(12, 6))\\n",
          "    librosa.display.waveshow(y, sr=sr)\\n",
          "    plt.title(f'Waveform - BPM: {tempo:.1f}')\\n",
          "    plt.show()\\n",
          "    \\n",
          "    return {'bpm': tempo, 'duration': len(y)/sr}\\n",
          "\\n",
          "print('✅ 음악 분석 함수 준비 완료!')"
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "# 🧪 사용 예시\\n",
          "# 음악 파일 경로를 지정하고 실행하세요\\n",
          "# audio_file = '/content/drive/MyDrive/music/sample.wav'\\n",
          "# result = analyze_music(audio_file)\\n",
          "# print(f'분석 결과: {result}')"
        ]
      }
    ]
  };

  // 노트북 파일 저장
  const notebooksDir = path.join(process.cwd(), 'analysis');
  const notebookPath = path.join(notebooksDir, `${name}.ipynb`);
  
  // 디렉토리 생성
  await fs.mkdir(notebooksDir, { recursive: true });
  
  // 파일 저장
  await fs.writeFile(notebookPath, JSON.stringify(notebookContent, null, 2));
  
  console.log(`✅ 노트북 생성 완료: ${notebookPath}`);
  console.log(`🔗 코랩에서 열기:`);
  console.log(`   https://colab.research.google.com/github/KIMJISUNG0/techno-prompt-local/blob/main/analysis/${name}.ipynb`);
  
  return notebookPath;
}

function showSyncGuide() {
  console.log('🔄 GitHub 동기화 가이드:');
  console.log('');
  console.log('1. 변경사항을 git에 커밋:');
  console.log('   git add analysis/');
  console.log('   git commit -m "Add colab notebook"');
  console.log('');
  console.log('2. GitHub에 푸시:');
  console.log('   git push origin main');
  console.log('');
  console.log('3. 코랩에서 GitHub 링크로 열기:');
  console.log('   https://colab.research.google.com/github/KIMJISUNG0/techno-prompt-local/blob/main/analysis/[노트북명].ipynb');
  console.log('');
  console.log('💡 팁: 코랩에서 편집 후 "파일 → GitHub에 사본 저장" 선택');
}

function showHelp() {
  console.log('🔗 VS Code ↔ Colab 브리지');
  console.log('');
  console.log('사용법:');
  console.log('  node scripts/colab-bridge-simple.js <command> [name]');
  console.log('');
  console.log('명령어:');
  console.log('  create <name>    새 음악 분석 노트북 생성');
  console.log('  sync             GitHub 동기화 가이드');
  console.log('  help             이 도움말 출력');
  console.log('');
  console.log('예시:');
  console.log('  node scripts/colab-bridge-simple.js create my_music_analysis');
  console.log('  node scripts/colab-bridge-simple.js sync');
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'create':
        const name = args[1] || `music_analysis_${Date.now()}`;
        await createMusicAnalysisNotebook(name);
        break;

      case 'sync':
        showSyncGuide();
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createMusicAnalysisNotebook, showSyncGuide };