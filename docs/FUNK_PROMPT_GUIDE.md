# FUNK 프롬프트 제작기 v2 (데이터 피드백 반영)

Colab 분석(`docs/lab/metrics.csv`) 결과를 기반으로 Funk 프롬프트를 더 정밀하게 다듬는 실전 가이드입니다. 목표는 (1) Tempo Drift 감소, (2) Loudness 일관성 확보, (3) Evolution 밀도 최적화, (4) 해시 기반 재현성 & 반복 학습 루프.

---
## 1. 최근 분석 요약
| 파일 | Target BPM | 측정 Tempo (librosa) | Tempo Drift(%) | LUFS | RMS Mean | Spectral Centroid | 비고 |
|------|------------|---------------------|----------------|------|----------|-------------------|------|
| mp3  | 95 | 112.35 | +18.3% | -17.30 | 0.132 | 3263.5 | 약간 더 밝고 가벼움 |
| wav  | 95 | 117.45 | +23.5% | -16.38 | 0.154 | 2669.5 | 저역/중역 강조 더 큼 |

Tempo Drift 계산: \( (tempo_{measured} - bpm_{prompt}) / bpm_{prompt} * 100 \)

> Drift가 +10%를 넘으면 "포켓이 앞으로 당겨짐" 혹은 모델이 기본 Groove를 빠르게 해석하는 경향. 이를 Prompt 레벨에서 교정.

---
## 2. Tempo Drift 진단 및 교정 전략
문제: 95 BPM 요청 → 112~117 BPM 생성 (과속). 원인 패턴:
- 지나치게 에너지 높은 어휘("punchy", "crack", "brass hits" 등) 초기 배치
- Hook 반복 + Evolve 구조만 있고 "laid-back", "pocket", "restrained" 같은 템포 안정화 단서 부족
- Swing 언급이 있으나 "relaxed" qualifier 없음 → 모델이 "energetic swung"으로 과해석 가능

교정 Prompt 토큰(선택적으로 조합):
- Tempo Anchor: `steady 95 bpm pocket`, `locked groove`, `no tempo push`, `avoid acceleration`
- Feel Modifiers: `laid-back swing`, `restrained energy first half`, `unpushed backbeat`, `slight behind-the-beat hats`
- Density Control: `controlled layering`, `gradual instrumentation (avoid early full stack)`

권장 삽입 구문 예시 (Short 모드 압축 전 장문):
```
Steady 95 bpm laid-back pocket; avoid tempo push; restrained first half then gradual evolve.
```
압축 과정에서 가장 중요한 키워드 순서: `steady 95 bpm` → `laid-back pocket` → `avoid push`.

---
## 3. Loudness & Dynamics
관측 LUFS: -16 ~ -17 (스트리밍 일반 목표 -14 대비 2~3 dB headroom). 클리핑 걱정 없고 다이내믹 유지됨.

원할 경우:
- 더 탄력/공간 강조: `retain dynamic headroom (~-16 LUFS)`, `no over-compression`
- 약간 더 존재감: `slightly denser low-mids`, `gentle tape glue`

Short 모드(≤200자)에서는 `dynamic headroom` 정도만 남기고 나머지 문구는 우선순위 낮게 배치.

---
## 4. Evolution(악기 레이어) 최적화
현재 Prompt는 초기부터 많은 악기 나열 → 모델이 에너지를 일찍 풀어버릴 확률 ↑ → 템포 가속/해석 치우침.

개선 패턴:
1. Core Layer (Loop 1~2): `bass, tight drums (unpushed), sparse clav`
2. Additive Layer (Loop 3~5): `wah guitar stabs, rhodes comp`
3. Contrast Layer (Loop 6~7): `horn stabs (light)`, optional `synth lead intro phrase`
4. Peak Layer (Final loops): `full horns + expressive synth lead`

Prompt 표현 예시:
```
Hook evolves 4 phases: core (bass+drums+clav) → add (wah + rhodes) → contrast (light horns, hint lead) → peak (full horns + lead).
```

Short 압축에서 각 Phase 키워드를 축약: `core→add→contrast→peak` (필요 시) 또는 `4ph-evolve`.

---
## 5. Prompt Template v2
### 5.1 Long Mode 예시 (설명형)
```
Funk P-Funk G-Funk instrumental, 95 BPM, 4/4. Steady 95 bpm laid-back pocket; avoid tempo push. One 4-bar hook repeats; hook evolves 4 phases: core (bass+unpushed tight drums+ sparse clav) → add (wah guitar + rhodes) → contrast (light horn stabs, hint synth lead) → peak (full horns + expressive lead). Laid-back swung 16th hats slightly behind beat. Cohesive structure, adaptive evolution, consistent timbre, dynamic headroom (~-16 LUFS), gentle tape glue.
```
> 필요 시 200자 초과 시 가이드라인/길이/믹스 문구부터 자동 제거.

### 5.2 Short Mode (200자 내 고밀도) 타겟 형태
(압축 로직 적용 전 우선순위 높은 토큰을 앞쪽에 나열)
```
Funk P-Funk G-Funk 95bpm steady laidback pocket no-push 4bHook evolve core→add→contrast→peak bass tightDrums clav wah rhodes horn stabs synthLead swung16 hats behindBeat dynamic headroom tape glue
```
실제 UI 압축기(CODEMAP + 길이 트림) 적용 후 예시 (가상):
```
Funk P-Funk G-Funk 95bpm steady laidback pocket no-push H4x? core→add→contrast→peak Bsyn Kt Ssnap Clv Gwah Rhds Hrn synthLD swung16 behind dyn-headroom tape70s
```
(200자 근접 시 뒤 토큰부터 drop 가능)

---
## 6. Tempo Error 피드백 루프 설계(예정)
파이프라인에 `tempo_error` 컬럼 추가 예정:
```
tempo_error = (tempo_librosa - bpm_parsed) / bpm_parsed
```
Threshold 제안:
- |error| ≤ 0.05 → OK
- 0.05 < |error| ≤ 0.12 → 경고(보정 토큰 1~2개 삽입)
- |error| > 0.12 → 강한 Drift (Anchor + Feel + Density 세트 삽입)

자동 교정 로직 초안:
1. error > +0.12 ⇒ prepend: `steady <BPM> pocket; avoid tempo push;` + replace `punchy` → `tight`.
2. error > +0.18 ⇒ 위 + `restrained first half` 추가 + evolution phase count 명시.
3. error < -0.07 (지나치게 느린 경우) ⇒ `forward momentum`, `crisp hats` 추가.

---
## 7. 해시 & 재현성
- 해시: SHA1(promptText) 앞 8자리 → 파일명 / prompts.jsonl 로깅.
- 변형(variant) 시 Prompt 의미적 변화가 있을 경우 새 Hash 자연 생성 → 동일 Hash로 다른 take 찍고 싶다면 Prompt text 변경 금지.

Variant 관리(차후): `__v2` suffix는 파일명에만 추가(분석 스크립트에 variant 필드 추가 예정) → Prompt 본문은 그대로 유지.

---
## 8. 반복 체크리스트
| Step | 액션 | 통과 조건 |
|------|------|-----------|
| 1 | Prompt 생성 & 서버 기록 | hash 발급, filenamePrefix 확정 |
| 2 | 오디오 생성 & rename | mp3/wav 모두 prefix 일치 |
| 3 | Colab 분석 | metrics.csv 해당 hash 존재 |
| 4 | tempo_error 계산 | 임계값 분류 |
| 5 | Drift 교정 토큰 삽입 | Short 모드 200자 내 유지 |
| 6 | 재생성 & 재분석 | error 감소 확인 (< 이전값) |

---
## 9. 바로 적용할 수정 제안 (현재 케이스)
- 현재 drift: +18~+23% (강한 과속) ⇒ Anchor + Feel + Density 모두 삽입 필요.
- 초안 Prompt 앞부분을 다음처럼 시작:
```
Funk P-Funk G-Funk instrumental, 95 BPM. Steady 95 bpm laid-back pocket; avoid tempo push; restrained first half.
```
- Evolution 구문에 phase 구조 명시 → 에너지 점진 강조.
- `punchy`, `crack` 대신 `tight`, `controlled` 사용.
- swung 표현 뒤에 `slightly behind beat` 추가.

---
## 10. 다음 개발 아이템
- [ ] tempo_error UI 표시 & 자동 교정 제안 패널 (Step 5)
- [ ] prompts.jsonl ↔ metrics.csv hash join하여 최근 Drift 시각화
- [ ] Loudness 목표(-16 유지 / -14 근접) 선택 스위치 → Prompt mix tokens 동적 삽입
- [ ] Spectral centroid 평균 기반 brightness feedback (과도 시 `darker mid-focused tone` 추천)

---
## TL;DR
과속 발생 시 "Tempo Anchor + Feel + Density 제어" 3요소를 앞부분에 배치하고, Evolution을 단계 명시로 구조화, 강한 에너지 단어를 중립/제어 어휘로 치환하여 모델이 템포를 올려 해석할 여지를 줄인다. Hash & Filename 규칙으로 분석-생성 루프를 재현 가능하게 유지.

즐거운 그루브 실험! 🕺
