#!/usr/bin/env python3
"""
VS Code ↔ Google Colab 브리지 스크립트
VS Code에서 코랩 노트북을 생성/동기화/실행할 수 있게 해주는 도구
"""

import os
import json
import requests
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
import argparse

class ColabVSCodeBridge:
    def __init__(self, project_path: str = "."):
        self.project_path = Path(project_path)
        self.notebooks_dir = self.project_path / "analysis"
        self.colab_config = self.project_path / ".colab-config.json"

    def setup_local_jupyter(self):
        """로컬 Jupyter 환경 설정 (코랩과 유사한 환경)"""
        print("🔧 로컬 Jupyter 환경 설정 중...")

        # 필요한 패키지 설치
        packages = [
            "jupyter",
            "jupyterlab",
            "google-colab",  # 코랩 호환성
            "librosa",       # 음악 분석
            "matplotlib",
            "numpy",
            "pandas",
            "google-cloud-storage",
            "google-cloud-firestore"
        ]

        print("📦 필요한 패키지 설치 중...")
        for package in packages:
            try:
                subprocess.run([
                    "pip", "install", package
                ], check=True, capture_output=True)
                print(f"  ✅ {package}")
            except subprocess.CalledProcessError:
                print(f"  ❌ {package} 설치 실패")

        print("✅ 로컬 Jupyter 환경 설정 완료!")

    def create_colab_notebook(self, name: str, template: str = "music_analysis"):
        """코랩 호환 노트북 생성"""
        print(f"📓 코랩 노트북 생성: {name}")

        templates = {
            "music_analysis": {
                "cells": [
                    {
                        "cell_type": "markdown",
                        "metadata": {},
                        "source": [
                            "# 🎵 음악 분석 노트북\\n",
                            "VS Code에서 생성된 코랩 호환 노트북\\n",
                            "\\n",
                            "## 설정\\n",
                            "1. 런타임 → GPU 변경\\n",
                            "2. 구글 드라이브 마운트\\n",
                            "3. GCP 서비스 계정 업로드"
                        ]
                    },
                    {
                        "cell_type": "code",
                        "execution_count": None,
                        "metadata": {},
                        "outputs": [],
                        "source": [
                            "# 🚀 코랩 환경 설정\\n",
                            "!pip install librosa google-cloud-storage google-cloud-firestore\\n",
                            "\\n",
                            "# 구글 드라이브 마운트\\n",
                            "from google.colab import drive\\n",
                            "drive.mount('/content/drive')\\n",
                            "\\n",
                            "# GCP 인증 설정\\n",
                            "import os\\n",
                            "os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/content/service-account.json'"
                        ]
                    },
                    {
                        "cell_type": "code",
                        "execution_count": None,
                        "metadata": {},
                        "outputs": [],
                        "source": [
                            "# VS Code 프로젝트와 동기화\\n",
                            "import sys\\n",
                            "sys.path.append('/content/drive/MyDrive/techno-prompt')\\n",
                            "\\n",
                            "# 프로젝트 파일 임포트\\n",
                            "# from scripts.gcp.colab_bridge import upload_analysis_result"
                        ]
                    }
                ]
            }
        }

        notebook_content = {
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
            "cells": templates.get(template, templates["music_analysis"])["cells"]
        }

        # 노트북 파일 저장
        notebook_path = self.notebooks_dir / f"{name}.ipynb"
        self.notebooks_dir.mkdir(exist_ok=True)

        with open(notebook_path, 'w', encoding='utf-8') as f:
            json.dump(notebook_content, f, indent=2, ensure_ascii=False)

        print(f"✅ 노트북 생성 완료: {notebook_path}")
        print(f"🔗 코랩에서 열기: https://colab.research.google.com/github/KIMJISUNG0/techno-prompt-local/blob/main/analysis/{name}.ipynb")

        return notebook_path

    def sync_to_colab(self, notebook_path: str):
        """VS Code 노트북을 코랩으로 동기화"""
        print(f"🔄 코랩 동기화: {notebook_path}")

        # GitHub를 통한 동기화 (가장 간단한 방법)
        print("GitHub를 통해 코랩과 동기화하려면:")
        print("1. 변경사항을 git에 커밋")
        print("2. GitHub에 푸시")
        print("3. 코랩에서 GitHub 링크로 열기")
        print(f"   📎 https://colab.research.google.com/github/KIMJISUNG0/techno-prompt-local/blob/main/{notebook_path}")

    def download_from_colab(self, colab_url: str, local_path: str):
        """코랩에서 노트북 다운로드"""
        print(f"⬇️ 코랩에서 다운로드: {colab_url}")
        print("수동 다운로드 방법:")
        print("1. 코랩에서 파일 → .ipynb 다운로드")
        print(f"2. {local_path}에 저장")
        print("3. git add & commit으로 동기화")

    def launch_local_jupyter(self):
        """로컬 Jupyter Lab 실행"""
        print("🚀 로컬 Jupyter Lab 실행 중...")

        try:
            subprocess.Popen([
                "jupyter", "lab",
                "--notebook-dir", str(self.notebooks_dir),
                "--no-browser"
            ])
            print("✅ Jupyter Lab 실행됨!")
            print("📂 노트북 디렉토리:", self.notebooks_dir.absolute())
            print("🌐 http://localhost:8888 에서 접근 가능")
        except FileNotFoundError:
            print("❌ Jupyter가 설치되지 않았습니다.")
            print("설치: pip install jupyterlab")

    def create_colab_shortcuts(self):
        """VS Code에서 코랩 관련 단축키/작업 생성"""
        vscode_dir = self.project_path / ".vscode"
        vscode_dir.mkdir(exist_ok=True)

        # tasks.json에 코랩 관련 작업 추가
        tasks_file = vscode_dir / "tasks.json"

        if tasks_file.exists():
            with open(tasks_file, 'r', encoding='utf-8') as f:
                tasks = json.load(f)
        else:
            tasks = {"version": "2.0.0", "tasks": []}

        # 코랩 관련 작업 추가
        colab_tasks = [
            {
                "label": "Colab: Create Music Analysis Notebook",
                "type": "shell",
                "command": "python",
                "args": ["scripts/colab-bridge.py", "create", "music_analysis_${input:notebookName}"],
                "group": "build",
                "presentation": {
                    "echo": True,
                    "reveal": "always",
                    "focus": False,
                    "panel": "shared"
                }
            },
            {
                "label": "Colab: Launch Local Jupyter",
                "type": "shell",
                "command": "python",
                "args": ["scripts/colab-bridge.py", "jupyter"],
                "group": "build",
                "presentation": {
                    "echo": True,
                    "reveal": "always",
                    "focus": False,
                    "panel": "shared"
                }
            },
            {
                "label": "Colab: Setup Environment",
                "type": "shell",
                "command": "python",
                "args": ["scripts/colab-bridge.py", "setup"],
                "group": "build"
            }
        ]

        # 기존 작업에 코랩 작업 추가 (중복 방지)
        for task in colab_tasks:
            if not any(t.get("label") == task["label"] for t in tasks["tasks"]):
                tasks["tasks"].append(task)

        with open(tasks_file, 'w', encoding='utf-8') as f:
            json.dump(tasks, f, indent=2, ensure_ascii=False)

        print("✅ VS Code 코랩 작업 추가 완료!")
        print("사용법: Ctrl+Shift+P → 'Tasks: Run Task' → 'Colab:' 작업 선택")


def main():
    parser = argparse.ArgumentParser(description="VS Code ↔ Colab 브리지")
    parser.add_argument("command", choices=["setup", "create", "sync", "jupyter", "shortcuts"])
    parser.add_argument("name", nargs="?", help="노트북 이름 (create 명령어용)")

    args = parser.parse_args()
    bridge = ColabVSCodeBridge()

    if args.command == "setup":
        bridge.setup_local_jupyter()
    elif args.command == "create":
        if not args.name:
            args.name = input("노트북 이름을 입력하세요: ")
        bridge.create_colab_notebook(args.name)
    elif args.command == "sync":
        print("GitHub 동기화 가이드:")
        bridge.sync_to_colab("analysis/")
    elif args.command == "jupyter":
        bridge.launch_local_jupyter()
    elif args.command == "shortcuts":
        bridge.create_colab_shortcuts()


if __name__ == "__main__":
    main()
