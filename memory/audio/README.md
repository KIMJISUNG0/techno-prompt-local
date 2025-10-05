# Audio Storage (Suno Renders)

이 디렉토리는 프롬프트로 생성된 오디오(wav/mp3 등) 파일을 보관합니다.

## 파일명 규칙

`<timestamp>__<lengthMode>__<hash|id>__<bpm>.<ext>`

권장 예시:
```
20251004T113045Z__short__8f2c1a__95bpm.wav
20251004T113312Z__long__b13ad9__108bpm.mp3
```

### 필드 설명
- `timestamp` : UTC 기준 ISO-like (YYYYMMDDThhmmssZ)
- `lengthMode` : `short` 또는 `long`
- `hash|id` : 프롬프트 텍스트 SHA1 앞 6~8자리 혹은 /lab/prompt 저장 시 받은 id
- `bpm` : 숫자 + 'bpm'
- `ext` : wav, mp3 (가능하면 wav 보존)

## 메타데이터 연동
/lab/prompt (구현 예정) 응답 id 또는 프롬프트 hash를 파일명에 반영하면 추후 Colab 분석에서 자동 매칭 가능합니다.

## Colab 매칭 스크립트 개요
```python
import glob, re, pandas as pd
AUDIO_RE = re.compile(r'^(\d{8}T\d{6}Z)__(short|long)__([0-9a-f]{6,8})__(\d+)bpm\.(?:wav|mp3)$', re.I)
rows=[]
for p in glob.glob('memory/audio/*.*'):
    fn=p.split('/')[-1]
    m=AUDIO_RE.match(fn)
    if m:
        ts,lmode,h,idbpm = m.groups()
        rows.append(dict(path=p, timestamp=ts, lengthMode=lmode, promptHash=h, bpm=int(idbpm)))

audio_df = pd.DataFrame(rows)
```

## 추후 자동화 아이디어
- /lab/prompt 저장 시 promptHash 반환 → 클라이언트에서 업로드/다운로드 자동 rename
- 품질평가 루프: audio_df + records DF merge 후 특징분석(lufs, tempo diff, spectral variance)

---
필요 변경 사항 있으면 README 수정하세요.
