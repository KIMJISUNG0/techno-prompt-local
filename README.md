# Multi-Genre Music Prompt Composer

다장르 음악 프롬프트/패턴 아이디어 생성기 (React + TypeScript + Vite + Tailwind + Framer Motion). 초기 "Legacy Techno" 단일 뷰 및 Simple Mode 는 통합/확장된 Quick & Progressive Composer 로 대체되어 제거되었습니다.

## 기능
- 카테고리(서브장르, 리듬, 베이스, 신스, FX 등)별 다중 선택
- Hover 시 세부 파라미터(서브옵션) 패널 표시 (예: 909 킥 Decay 변형)
- 정확 BPM 입력 (60–200)
- 로컬스토리지 프리셋 저장 / 불러오기 / 삭제
- 프리셋 Export(JSON) / Import 지원
- 실시간 프리뷰 & Copy
- 검색(Search) 즉시 필터링
- KR / EN 간단 UI 토글 (그룹명 번역)
- 드럼/베이스/신스 세분화: family / primary 개념으로 기본만 보이게 Collapse 후 Expand 토글
- 선택된 옵션 우선 정렬 (selected-first)
- Advanced Toggle: 핵심 그룹만 먼저 노출 → 전체 확장
- Glassmorphism + 네온 사이버(Apple 감성 믹스) 스타일 적용
 - Compact Mode: 그룹을 작은 그리드 칩으로 나열하고 Hover 시 패널(옵션 목록) 오버레이
	 - 화면 폭 < 1280 자동 활성화
	 - 검색(query) 중에는 정보량 확보 위해 자동 비활성화

## Free Mode (LLM API Key 없이 개발)
OpenAI / Gemini 유료 키 없이 오케스트레이터 / Council / Workflow 를 돌리고 싶으면 `.env` 에 다음을 넣고 재시작:

```
ALLOW_MOCK_AI=1
```

동작 방식:
- 실제 키가 없을 때 `services/workflow.ts`, `services/model-council.ts` 가 실패 대신 결정적(mock) 텍스트/patch 블록 생성
- Patch 추출/파이프라인/프론트엔드 연동을 비용 없이 개발 가능
- 모의 패치 예: `src/mock/free-mode-example.ts` 생성 제안

주의:
- 품질/논리 정확도 보장 안 됨 (테스트/UX 검증용)
- 실서비스 배포 시 이 변수를 제거하거나 0 으로 설정
- 진짜 모델 성능 차이 확인하려면 키 추가 후 ALLOW_MOCK_AI 제거

관련 환경변수(모델 교체): `WORKFLOW_GPT_MODEL`, `WORKFLOW_GEMINI_MODEL`, `COUNCIL_*_MODEL`

### Ensemble Endpoint (빠른 병렬 창의 집약)
`POST /ensemble`
Body 예시:
```json
{ "prompt": "장르 세분화: dark hypnotic techno 와 raw industrial techno 차이 정교화", "creativeVariants": 4 }
```
내부 수행:
- Workflow(병렬 Gemini+GPT)
- Model Council(다단계 요구/설계/패치/리뷰/리파인)
- 고온도(temperature 높음) 창의 변형 N개 생성
- Converge 단계에서 모두 종합 Markdown 산출

추가 ENV:
- ENSEMBLE_CREATIVE_MODEL (기본: gpt-4.1-mini → 없으면 gemini-1.5-flash → mock)
- ENSEMBLE_CONVERGE_MODEL (기본: gpt-4.1 → 없으면 gemini-1.5-pro → mock)
- ENSEMBLE_CACHE=1 (Redis 있으면 Redis + 메모리, 없으면 메모리)
- ENSEMBLE_CACHE_TTL=600 (초)

## 실행 방법

### 1. 의존성 설치
```bash
npm install
```

### 2. 개발 서버 실행
기본:
```bash
npm run dev
```
Fast 개발(일부 장르만 로드: 초기 빌드/핫리프레시 가속):
```bash
npm run dev:fast   # 내부적으로 VITE_LIMIT_GENRES=techno,hiphop,trap
```
Codespaces / 컨테이너 (고정 포트 & 외부 접속 안정):
```bash
npm run dev:strict   # 0.0.0.0:5173 고정, 포트 이미 사용시 즉시 실패
```
Codespaces 전용(동일 동작):
```bash
npm run dev:codespaces
```
출력 예시:
```
Local:   http://localhost:5173/
Network: http://10.x.x.x:5173/
```
GitHub Codespaces 에서는 브라우저 주소가 다음 형태로 노출됩니다:
```
https://<workspace>-5173.app.github.dev/
```

### Orchestrator 연동 (프롬프트 서버 로그)
프론트(5173)와 오케스트레이터(4000)를 함께 쓸 때 Funk Wizard Step 5 의 `/lab/prompt-log` 호출이 실패하면 환경변수를 지정하세요.

PowerShell:
```powershell
$env:VITE_ORCH_BASE = 'http://localhost:4000'
npm run dev
```
macOS/Linux:
```bash
export VITE_ORCH_BASE=http://localhost:4000
npm run dev
```
배포 환경(Render 등)에서 서로 다른 도메인이라면 빌드 전에 동일 변수 설정.

#### 502 (Bad Gateway) 오류 대처
| 증상 | 원인 | 해결 |
|------|------|------|
| 502 Bad Gateway | dev 서버 내려감 / 포트 미리스닝 | `npm run dev:strict` 재실행 |
| 403 / 404 | 포트 Private | Ports 패널에서 Public 설정 |
| 빈 화면 | 캐시 잔존 | 강력 새로고침 (Ctrl+Shift+R) |
| hash 직행 안 됨 | `#g=` 오타 | 예: `#g=techno+trance` 소문자 확인 |

헬스 모니터 (선택):
```bash
npm run health:loop
```

### 3. 프로덕션 빌드
```bash
npm run build
npm run preview
```

### 4. Taxonomy Validator
중복 ID / 그룹 누락 / orphan subopts / universal prefix 검사:
```bash
npm run validate:taxonomy
```

### 5. Pre-commit Hook (자동 품질 게이트)
`husky` 설치되어 커밋 시 순서대로 실행:
1) validate:taxonomy
2) typecheck (tsc --noEmit)
3) lint (ESLint)

실패 시 커밋 중단.

### 6. VS Code Tasks
명령 팔레트 → Tasks: Run Task
 - Dev (Full)
 - Dev (Fast Genres)
 - Validate + Dev
 - Local CI (validate+typecheck+build)

### 7. CI
GitHub Actions: push/PR 시 validate → build. (추후 lint/typecheck 추가 가능)

## 기술 스택
- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- Framer Motion

## 폴더 구조 (요약)
```
src/
	main.tsx            # 진입점 / 해시 라우팅 (quick, composer, live-test 등)
	components/
		QuickComposer.tsx             # 의도(무드/강도/유스케이스) → 구조 Draft → 변형/품질/프롬프트
		portal/GenrePortal.tsx        # 장르 선택 + Arranger + ProgressiveComposer 통합
		wizard/MultiGenrePromptWizard.tsx # 기존 Composer (다장르 마법사)
		ProgressiveComposer.tsx (portal 내부 통합) # 단계별 토큰 선택 프롬프트
		LiveCodingConsole.tsx         # 라이브 코딩 / 패턴 DSL / 엔진 제어
		AudioViz.tsx                  # 실시간 분석 시각화
	prompt/  intent/  live/  data/  progressive/  ...
```

## 구조적 설계 포인트
- Schema-first: `src/data/taxonomy.ts`에 모든 GROUP/OPTIONS/SUBOPTS 정의 → UI는 순수 표현 레이어
- family / primary: 많은 Drum/Bass/Synth 세부 옵션을 첫 화면에서 과도하게 보여주지 않도록 핵심(primary) 또는 선택된 항목만 노출 → Expand 시 전체 표시
- SUBOPTS → PARAMS_LOOKUP 자동 매핑
- 직렬화: 선택 상태는 Set 기반 → 저장 시 배열 변환

## 개선 예정 아이디어
- 옵션 전체 한글 번역 (현재 그룹명 위주)
- 패밀리별 Collapse 상태 저장 (로컬)
- 모바일 Drag 스크롤 최적화
- AI 모델 호출 연동 (OpenAI / Local)
- 다중 프롬프트 배치 생성 모드
- Export 시 미니메타(BPM, 날짜) 포함
- 장르 팩 Lazy Load (dynamic import)
- Validator 경고 레벨 세분화(JSON 리포트)

## Live Coding & Audio Engine (Phase1 → 확장)
Phase1: 완전 커스텀 WebAudio 합성 엔진 및 콘솔 (기본 패턴/합성) → 이후 Tone.js 하이브리드 + 고급 Visualization + Pattern DSL v2 + FX 커스터마이징으로 확장.
- 지원 음색: kick / snare / hat / bass / lead / pad (+ band extensions: guitar, bassGtr, piano, organ, tom, clap, ride)
- 패턴: 16 스텝 반복, 문자 기반 velocity (`X` accent, `x` normal, `.` ghost, `-` rest)
- FX: 딜레이, 리버브(프로시저럴 임펄스), 마스터 컴프레서, 글로벌 사이드체인 duck (킥 트리거)
- Swing 퍼센트 적용 (짝수 16분 지연)
- Patch Registry: `registerPatch`, `triggerPatch`, `listPatches`
- 실시간 파라미터 갱신: `update(id, { gain, pattern, decay ... })`
- Sandbox 보안 강화: 허용 API 화이트리스트 & `with` 제거

### Phase2 (계획)
- 샘플 로더 (간단 1‑shot + 경량 캐싱)
- 개별 버스 사이드체인 (sidechain group tagging)
- Supersaw / Noise Layer 확장 (unison detune, 초저역 EQ trim)
- 필터/피치 Env & LFO 매트릭스 확장 (다중 LFO 라우팅)
- 패턴 변형 유틸 (humanize, rotate, density 스케일)

### Tone.js 하이브리드 통합
Phase1.5 로 Tone.js 를 선택적(poly / FM / Metal 등) 음색 재생에 도입.
- 커스텀 엔진: 초경량 패턴 드럼 & 베이스 (낮은 오버헤드)
- Tone.js: 고수준 Synth/FMSynth/AMSynth/MetalSynth/NoiseSynth 등 즉시 호출
- Lazy Load: 최초 `tonePlay()` 호출 시 import → 번들 초기 용량 최소화
- Sandbox API: `tonePlay(id, { type, notes, duration, velocity })`, `toneStop(id)`, `toneStopAll()`, `listTone()`
- 향후 연동: Tone Transport ↔ 커스텀 스케줄러 BPM 동기 (현재는 단발 트리거 중심)

#### 확장 (Phase1.5 + v2)
- FX 체인 옵션(문자열 + 커스터마이징 객체)
- BPM 동기: `setToneBPM(128)` → `tonePatternPlay` Transport 기반 스텝
- Pattern DSL v1 → v2 업그레이드 (아래 ‘Pattern DSL v2’ 참고)
- 자동 메모리 청소: 45s 이상 미사용 Tone 인스턴스 dispose
- Transport 기반 재생: 지터 감소 및 홀드/악센트 문법 지원

### Pattern DSL v2 (Transport 기반)
문자열로 시퀀스를 정의하고 Tone.Transport 스케줄로 반복:
- 노트 토큰: `C4`, `D#3`, `G2` (대소문자 무관)
- 휴지: `.` 또는 `-`
- 홀드: `_` 직전 노트 길이 +1 스텝 (연속으로 누적 가능, 예: `C4__` = 3스텝)
- 벨로시티 악센트: `!` (×1.2), `?` (×0.75) 노트 직후에 배치
- 기본 스텝: 16분 (옵션 `step:'16n'`)

예시:
```js
setToneBPM(128)
tonePatternPlay('arp1', 'C4_E4.G4!_B4.-C5?', { type:'synth', velocity:0.85, fx:[{ type:'reverb', decay:3 }] })
```

### FX 커스터마이징 (문자열 vs 객체)
`tonePlay` / `tonePatternPlay` 의 `fx` 필드:
- 문자열: 공유 캐시 FX (메모리 절약) – 예: `['reverb','delay']`
- 객체: 개별 인스턴스 (파라미터 커스터마이즈)

지원 타입 및 대표 파라미터:
- `reverb`: `decay`, `wet`
- `delay`: `time`, `feedback`, `wet`
- `distortion`: `amount` (`distortion` alias)
- `chorus`: `frequency`, `delayTime`, `depth`
- 추가: `bitcrusher (bits)`, `phaser (frequency, octaves, baseFrequency)`, `filter (frequency, type)`

예시:
```js
tonePlay('pad', {
	type:'synth',
	notes:['C3','E3','G3','B3'],
	duration:'2n',
	fx:[
		{ type:'reverb', decay:4.2, wet:0.4 },
		{ type:'delay', time:'8n', feedback:0.32, wet:0.28 }
	]
})
```

### Analyser API & 이벤트
엔진 post-FX 지점의 `AnalyserNode` 스냅샷:
```js
getAnalyser() // => { freq:Uint8Array, time:Uint8Array, level:number }
```
그리고 각 히트는 다음 커스텀 이벤트 디스패치:
```js
window.addEventListener('liveaudio.hit', e => {
	// e.detail = { role, id, velocity, index, when }
})
```

### Advanced Visualization
`AudioViz` 컴포넌트:
- 주파수 바 (adaptive hue: 저역→고역) + 피크 홀드 라인
- 시간 파형 오버레이 (lighter blend)
- 히트 이벤트 플래시 (감쇠 기반 alpha)
- 30fps 제한 / 메모리 재사용 (Zero GC per-frame)

### iOS26 스타일 UI & 아이콘
CSS 토큰 + conic gradient ring 기반의 `.ios-bubble`, `.ios-pill` 제공. 
아이콘 세트(`src/components/icons/Icons.tsx`) – `IconPlay`, `IconPause`, `IconTheme`, `IconDocs` 등 currentColor 활용 경량 SVG.

### Auto Theme
`prefers-color-scheme` 감지하여 다크/라이트 자동 선택 + 수동 토글 지원 (`data-theme` + root class `dark`).

### iOS26 스타일 UI 레이어
커스텀 glass + chroma ring:
- 새 클래스: `.ios-bubble` (라운드 컨트롤), `.ios-pill` (확장형), `.ios-cluster`
- Conic gradient ring + radial sheen + blur/saturate 조합
- CSS 토큰: `--ios-ring`, `--ios-sheen`, `--ios-glass-bg`
- 헤더 액션 버튼 및 Copy 버튼 반영

### Lightweight Audio Visualization
기본 컨셉은 유지되며 위 ‘Advanced Visualization’ 섹션으로 기능 확장됨.

### Phase3 (계획)
- 멀티샘플 매핑 (velocity layer / round robin)
- AI 패턴/프로그레션 생성 (프롬프트 → seed 변형)
- Patch Morphing (두 패치 연속 보간)
- 오디오 Export (오프라인 렌더링 or MediaRecorder)

문서화 진행 상황: `LiveCoding` 콘솔 Help 탭에 최신 API 반영.

## 공유 가능한 장르 해시
직접 장르/하이브리드 진입:
```
# 단일
https://<host>/#g=techno
# 하이브리드
https://<host>/#g=techno+trance
```
변경 시 해시 자동 갱신.

Legacy Techno 단일 전용 뷰와 Simple Mode 는 2025-10-03 기준 제거되었습니다. Quick / Portal Arranger / Progressive Composer 경로를 사용하세요.
2) (추가 예정) `#g=techno&mode=legacy` 방식 지원 가능

## Offline Prompt Logging (Serverless Mode)
Fastify 오케스트레이터 없이 프롬프트를 로깅하고 분석 루프를 돌리는 최소 마찰 흐름:

1. Funk Prompt Wizard Step5 에서 프롬프트 구성 → "로컬 기록 (Offline)" 클릭 (localStorage 큐 저장)
2. 여러 개 누적 후 "Export (.jsonl)" → Google Drive 동기화 폴더(예: `My Drive/TECHNO_PROMPT_MEMORY/exports/`)
3. Colab Merge 셀 실행 (exports/*.jsonl → `memory/records/prompts.jsonl` 병합 & 커밋)
4. VS Code 에서 `git pull` → 확인 후 필요 시 push
5. (선택) 오디오 생성 & rename → 분석 셀 → summary.json 커밋 → pull → 다음 프롬프트

## Lab Sync & Analysis Helper (Copilot Prompt Bundle)

Colab 분석 산출물을 VSCode 로 왕복하고, 특정 해시(prefix)만 필터링/진단하기 위한 Copilot Chat 지시문 모음.

### A) Git 루트/리모트/작성자 점검
```
git rev-parse --show-toplevel
git branch --show-current
git remote -v
git config --global user.name "KIMJISUNG0"
git config --global user.email "slyjek@gmail.com"
git remote set-url origin https://github.com/KIMJISUNG0/techno-prompt-local.git
```

### B) .gitignore 무시 패턴 점검
```
git check-ignore -v docs/lab/* | cat   # 출력 없으면 OK
```

### C) Colab 산출물 커밋/푸시 원샷
```
git stash push -m pre-lab-sync || echo "no local changes";
git add docs/lab/*.csv docs/lab/*.json docs/lab/*.png memory/records/prompts.jsonl;
git commit -m "lab: sync from Colab (latest analysis)" || echo "no changes";
git pull --rebase origin main;
git push origin main;
git log -1 --name-only;
```

### D) 해시 반영 여부 확인 (예: e272747f)
```
Select-String -Path docs/lab/metrics.csv -Pattern e272747f; if(!$?){"metrics.csv에 없음"}
Select-String -Path docs/lab/summary.json -Pattern e272747f; if(!$?){"summary.json에 없음"}
```

### E) 누락 해시 탐지 스크립트
```
npx tsx scripts/find-missing-hashes.ts
```
출력: `{ audioCount, analyzedCount, missingCount, missing[] }`.

### F) 특정 prefix 분석 결과 필터 (최신 1개)
```
npx tsx scripts/filter-analysis-by-prefix.ts --markdown
```

### Colab 경로 & 파일명 파서 패치 (요약)
1. 경로 자동 탐지: `Othercomputers/내 노트북` / `My Laptop` 중 존재하는 경로 선택.
2. 정규식: `^(\d{8}T\d{6}Z__[a-z0-9]+__[a-f0-9]{8}__\d{2,3}bpm)(?:__v\d+)?\.(mp3|wav)$`
3. 매칭된 base prefix + `.prompt.txt` 짝이 있는 세트만 최신 N 개 분석.

### 분석 누락 발생 시 체크리스트
- Colab INBOX 에 prefix__v1/v2.mp3 존재?
- `.prompt.txt` 동반 여부
- 정규식 hash 추출 성공 여부
- 기존 metrics.csv 에 동일 hash → 중복 스킵 로직 작동?

JSONL 한 줄 예:
```json
{"hash":"9cd2139c","ts":"2025-10-05T09:33:12.123Z","bpm":106,"mode":"short","text":"Funk ...","filenamePrefix":"20251005T093312Z__short__9cd2139c__106bpm"}
```

### Colab Merge 셀(요약 코드 스니펫)
Added / dup / conflict / bad 카운트를 출력, 새 레코드만 append 후 커밋 (push 는 VS Code 에서 수동).

### 큐 관리
- "큐 미리보기": 최근 저장 목록 확인
- "큐 비우기": Export 후 초기화(실수 방지를 위해 Export 복수회 권장)

## Suno Download Auto-Watcher (Windows PowerShell)
Suno 또는 유사 서비스에서 막 내려받은 `.mp3/.wav` 를 자동으로 표준 prefix + 버전번호(`__v1`, `__v2` ...)로 INBOX 폴더에 복사하고 동일 prefix 의 `.prompt.txt` 를 생성.

### 설치
이미 `scripts/watch_suno.ps1` 포함.

### 1) 초기 설정
```powershell
powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -Setup
```
프롬프트: INBOX 경로 / 다운로드 폴더 / Wizard 에서 복사한 파일 Prefix / 프롬프트 텍스트 입력.

### 2) Prefix 또는 Prompt 갱신
```powershell
powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -SetPrefix "20251005T084338Z__long__e27274f__106bpm"
powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -SetPrompt (Get-Content .\final_prompt.txt -Raw)
```

### 3) 감시 실행
```powershell
powershell -ExecutionPolicy Bypass -File scripts\watch_suno.ps1 -Run
```
다운로드 발생 시: `<prefix>__v1.mp3` + `<prefix>__v1.prompt.txt` 식으로 누적.

### 주의
- mp3 와 wav 을 동시에 받을 경우 v 번호가 개별 증가.
- 완전 표준 파일명(`prefix + 확장자`)만 필요하면 한 번에 한 포맷만 사용하거나 후처리에서 `__vN` 제거 후 최종 해시 명명 규칙으로 재정렬.

## macOS / Linux 간단 폴링 스크립트 (선택)
`watch_suno.sh` 예시(README 상단 설명 참조)로 2초 간격 Downloads 폴더 폴링.


## Render 배포 가이드

### 1) Static Site (권장)
Vite 빌드 산출물은 정적 자원이므로 SSR 불필요합니다. 이미 `render.yaml` 추가됨.

배포 단계:
1. GitHub 저장소 연결 → New Static Site
2. Root Directory: `/` (프로젝트 루트)
3. Build Command: `npm install && npm run build`
4. Publish Directory: `dist`
5. Deploy 클릭

자동 라우팅(해시 기반)이라 SPA history rewrite 는 필수는 아니지만 fallback 포함(`render.yaml`의 rewrite) 되어 있음.

### 2) Web Service (선택)
프리뷰용 Node 서버(예: `npm run preview`)를 Render Web Service 로 올릴 수도 있으나 정적 버전 대비 비용/콜드스타트 비효율.

Docker 필요 시:
```
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback
RUN printf 'try_files $uri /index.html;\n' > /etc/nginx/conf.d/default.conf
```

### 3) 환경 변수/버전
현재 .env 필요 없음. Node 18+ 호환 (`engines` 필드 지정).

### 4) 캐시/최적화 팁
- Render Static Site 는 빌드 산출물 정적 캐시 → 변경 시 자동 purge
- 장기 캐시 적용하려면 `vite.config`에서 `build.rollupOptions.output.assetFileNames` 패턴 유지 (해시 포함 기본값이면 OK)

### 5) 배포 후 테스트 링크
`https://<your-render-domain>/#g=techno+trance`


## License
MIT (필요 시 수정 가능)

## Stack Composer (Layer-by-Layer Prompt Flow)
드럼 → 베이스 → 코드 → 리드 → FX → Groove → Mix → Master → Review 순서로 프로덕션 워크플로를 모사하는 단계형 프롬프트 빌더.

### 핵심 개념
- Reducer 상태: `layers[]` (각 레이어: role, descriptors[], pattern) + `meta` (bpm, swing, fx/mix/master 요약)
- Draft 편집: 특정 role 시작 → descriptors & pattern 편집 → Commit 시 `layers`에 확정
- 패턴 입력: 현재는 텍스트 기반 (차후 16-step grid / velocity UI 예정)
- 실시간 미리듣기: 레이어 커밋 시 `liveEngine.play(id,{ pattern, type:role })` 자동 업데이트
- Swing / FX / Mix / Master 슬라이더 & 노트는 최종 Prompt에 요약 라인으로 삽입

### Prompt 예시 (요약)
```
128 BPM 4/4
DRUMS: punchy busy, tight sparse, snappy sparse
BASS: growl legato
CHORDS: lush legato
LEAD: bright staccato
GROOVE: swing 12%
FX: subtle long-tail shimmer, tight slapback lead
MIX: tight low-end, airy highs
MASTER: transparent glue, gentle high shelf
```

### 향후 확장
- Pattern grid + accent/hold 비주얼 에디터
- Layer compare & mute/solo
- Export: JSON (state) + Plain Prompt + 패턴 개별 블록
- Diff view (최근 스냅샷 vs 현재)

## 자동 배포 (GitHub → Render)
메인 브랜치에 push 시 GitHub Actions 가 build 검증 후 Render Static Site 가 변경 감지하여 재빌드합니다.

### 파이프라인 개요
1. `push` → GitHub Actions: taxonomy validate + build
2. 성공 시 Render Webhook(연결 시) 또는 Render 가 Repo 변경 polling → deploy
3. `render.yaml` 로 build/publish 경로 (`dist`) 설정

수동 트리거가 필요 없으므로 관리 부담 최소화. 추가로 lint/typecheck 를 Actions 워크플로에 확장할 수 있습니다.

## 개발 환경 설정

### 권장 VS Code 확장프로그램
이 프로젝트는 다음 확장프로그램들과 최적화되어 있습니다:

**핵심 도구:**
- GitHub Copilot & Chat: AI 지원 코드 작성
- ESLint: 코드 품질 검사
- Prettier: 코드 포맷팅
- TailwindCSS IntelliSense: 스타일 자동완성
- ErrorLens: 실시간 오류 표시

**생산성 도구:**
- Material Icon Theme: 파일 아이콘
- GitLens: Git 히스토리 시각화
- REST Client: API 테스트
- Live Server: 로컬 서버
- Code Spell Checker: 맞춤법 검사

### 개발 스크립트
```bash
# 개발 서버 시작
npm run dev

# 타입 체크
npm run typecheck

# 린트 검사
npm run lint

# 코드 포맷팅
npm run format

# 전체 CI 체크 (권장)
npm run ci

# 오케스트레이터 시작 (백엔드)
npm run dev:orchestrator:mem
```

### VS Code 설정
프로젝트에는 다음이 미리 구성되어 있습니다:
- **자동 포맷팅**: 저장 시 Prettier + ESLint 자동 실행
- **TailwindCSS**: 클래스 자동완성 및 검증
- **TypeScript**: 상대 경로 import, 자동 organize imports
- **Tasks**: Ctrl+Shift+P → "Tasks: Run Task"로 개발 작업 실행
- **Debug**: F5로 Chrome 디버깅 또는 Node.js 스크립트 디버깅

### 코드 품질 도구
- **TypeScript**: 엄격한 타입 검사
- **ESLint**: React/TypeScript 규칙 적용
- **Prettier**: 일관된 코드 스타일
- **Vitest**: 빠른 단위 테스트
- **Husky**: commit 전 자동 검증 (lint-staged)

## 배포 옵션 비교: RENDER vs GCP

### 🚀 **현재 (RENDER)**
```yaml
# render.yaml
services:
  - type: web
    name: techno-prompt
    runtime: static
    buildCommand: bash ./render-build.sh
    staticPublishPath: ./dist
```

### ☁️ **GCP 전환 이점 (무료 범위)**

| 기능 | RENDER | GCP | 코랩 연동 이점 |
|------|--------|-----|---------------|
| **정적 호스팅** | ✅ 무료 | ✅ Firebase Hosting 무료 | - |
| **백엔드 API** | ✅ 무료 (제한적) | ✅ Cloud Run 2M 요청/월 | 동일 Google 계정 인증 |
| **데이터베이스** | ❌ PostgreSQL 유료 | ✅ Firestore 1GB 무료 | 코랩에서 직접 쿼리 가능 |
| **파일 저장소** | ❌ 별도 서비스 필요 | ✅ Cloud Storage 5GB 무료 | Google Drive 자동 동기화 |
| **AI/ML 서비스** | ❌ 외부 API만 | ✅ Vertex AI 통합 | 코랩 GPU/TPU → Vertex AI |
| **모니터링** | ✅ 기본 제공 | ✅ Cloud Logging 무료 | 코랩 실행 로그 통합 |
| **CI/CD** | ✅ GitHub 연동 | ✅ Cloud Build 무료 | - |

### 🔗 **코랩 연동 특화 이점**

#### **1. seamless Google 생태계**
```python
# 코랩에서 한 번의 인증으로 모든 GCP 서비스 접근
from google.colab import auth
auth.authenticate_user()

# 분석 결과를 앱에서 바로 사용 가능
upload_analysis_result("audio-pattern", input_data, results)
```

#### **2. 실시간 데이터 파이프라인**
```
Colab 분석 → Cloud Storage → Firestore → React App
     ↓              ↓             ↓          ↓
  GPU 가속       자동 백업     실시간 동기화  즉시 시각화
```

#### **3. 비용 최적화**
- **Colab Pro**: $10/월로 더 많은 GPU/TPU 시간
- **GCP 무료**: 월 $0으로 프로덕션 배포
- **VS** RENDER + 외부 DB: 월 $20+ 필요

### 🛠️ **GCP 전환 명령어**
```bash
# 1. GCP 프로젝트 생성 및 설정
gcloud projects create techno-prompt-2025
gcloud config set project techno-prompt-2025

# 2. 필요한 API 활성화
gcloud services enable appengine.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable firestore.googleapis.com

# 3. 앱 초기화 및 배포
gcloud app create --region=asia-northeast1
npm run gcp:deploy

# 4. 코랩 연동 테스트
npm run gcp:colab:generate
```

**결론**: 코랩 중심 워크플로라면 GCP 전환이 강력히 권장됩니다! 🎯
