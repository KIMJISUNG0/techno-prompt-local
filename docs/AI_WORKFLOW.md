# AI Collaboration Workflow (Copilot + Gemini + Local Dev Containers)

이 문서는 GitHub Codespaces 와 로컬 VS Code 환경에서 동일한 개발 경험을 유지하면서 GitHub Copilot 및 Google Gemini(제미나이)를 함께 활용하는 방법을 정리합니다.

## 1. 환경 통일 전략
- `.devcontainer/devcontainer.json` 으로 **의존성 / 확장 / Node 버전**을 고정 → Codespaces & 로컬 (Dev Containers 확장) 모두 동일하게 재현.
- 로컬에서도 `Dev Containers: Reopen in Container` 명령을 사용하면 Codespaces 와 동일한 Linux 기반 환경.
- 팀 합류/새 PC 세팅 시: Git clone → VS Code 열기 → "Reopen in Container" → 자동 `npm install`.

## 2. 도구 역할 분리
| 도구 | 주 용도 | 강점 | 비고 |
|------|---------|------|------|
| GitHub Copilot | 짧은 코드 자동완성 | 문맥 내 빠른 패턴 학습 | 에디터 인라인 사용 |
| Copilot Chat | 리팩터/설명/테스트 제안 | 현재 열려있는 파일/워크스페이스 인식 | 명령 기반 프롬프트 |
| Gemini (제미나이) | 아이디어 확장, 설계 비교, 다국어 설명 | Creative/설계/요약 강점 | API/플러그인 or 웹 UI |
| Local TypeScript/ESLint | 정적 품질 보증 | 정확한 오류 검출 | `npm run typecheck` / `npm run lint` |

## 3. 추천 작업 흐름
1. 요구사항(or 이슈) 자연어 정리 → `docs/` 에 초안 저장 (예: `FEATURE_x.md`).
2. Gemini 로: "문제 재구성 / 대안 아키텍처 / 엣지 케이스" 질문.
3. 결정된 간단한 인터페이스(타입, 함수 시그니처)를 코드에 먼저 스텁 작성.
4. Copilot 로 세부 구현 자동완성 유도 (함수 내부 주석으로 단계 힌트).
5. 구현 후:
   - `npm run typecheck`
   - `npm run lint`
   - 필요한 경우 추가 테스트(현재 테스트 프레임워크 없으므로 추후 Vitest 도입 고려).
6. Gemini 에게 모듈간 설계 리뷰 & 성능/확장성 질문.
7. 커밋 메시지: 문제 → 해결 요약 → 주 영향 영역.

## 4. 고급 프롬프트 패턴
### (A) 설계 검증 (Gemini)
```
역할: 시니어 프론트엔드 아키텍트
목표: 오디오 재생 로직과 UI 상태 분리 설계 리뷰
제약: React 18, Tone.js 유지, 전역 상태 관리 도입은 안함
출력: 1) 문제점 목록 2) 개선 제안 3) 점진적 적용 순서
```
### (B) 점진 구현 (Copilot Chat)
```
Add JSDoc and error handling to the function `schedulePatternPlayback` focusing on invalid BPM and empty pattern cases.
```
### (C) 리팩터 시나리오 비교
```
Compare approach A (prop drilling) vs B (custom hook + context) for passing playback control.
Focus: bundle size, re-renders, testability.
```

## 5. 품질 자동화 아이디어 (다음 단계)
- GitHub Actions: `npm ci && npm run ci` (typecheck + build) → PR마다.
- Pre-commit: 이미 Husky + lint-staged 구성 → 저장소에 기여 규칙 문서화.
- Vitest + React Testing Library 도입 → UI 상태/오디오 훅 테스트.

## 6. AI 사용시 주의
- 민감한 토큰/비밀: 절대 프롬프트에 붙여넣지 않기.
- 대답을 그대로 커밋하지 말고: 타입/런타임 오류 여부 `typecheck` 로 검증.
- 지나친 추상화(불필요한 클래스/패턴) 제안은 실제 사용 사례를 대조 후 채택.

## 7. 문제 분할 Cheat Sheet
| 문제 유형 | 분할 질문 예시 |
|-----------|----------------|
| 복잡 UI 상태 | 상태 그룹은? 파생/입력/비동기 구분은? |
| 성능 | 무엇이 재렌더 트리거? 메모이제이션 후보? |
| 오디오 타이밍 | 어떤 부분이 밀리초 정밀도 필요? 메인 스레드 vs AudioContext 타이밍? |
| 국제화(i18n) | 고정 문자열은 어디? 변형 규칙(복수형, 포맷)은? |

## 8. 로컬 ↔ Codespaces 동기화 팁
- 항상 `git pull --rebase origin main` 후 새 작업 브랜치 생성.
- Codespaces 에서 수정한 `.devcontainer/*` 는 로컬에서도 즉시 반영 가능.
- Node version drift 방지: devcontainer 이미지(Node 20)와 로컬 nvm 설정 일치.

## 9. 추가 개선 제안 (원하면 진행 가능)
- `.devcontainer` 에 `postCreateCommand`: `npm run ci` 로 엄격 검증.
- `.vscode/settings.json` 추가로 워크스페이스 전용 포맷/탭 규칙.
- Gemni 연동 자동화 스크립트 (예: REST 호출) 초안.

필요하면 위 항목 중 적용 원하는 것을 번호로 알려주세요. 그럼 다음 단계 실행을 도와드릴게요.
