import React, { useMemo, useState } from 'react';

// --- 도메인 타입 (한글 UI 전용) ---
type PromptSpec = {
  id: string;
  bpm: number;
  key: string; // 예: E minor
  swing: number; // 0–60
  genre: string; // 예: 네오소울펑크
  vibe: string[]; // 분위기 태그
  instruments: string[]; // 악기 프리셋
  form: '벌스-코러스' | 'AABA' | '잼' | '인트로-그루브-브레이크-아웃트로';
  dsl?: string; // 16스텝 패턴 DSL (멜로디/베이스)
  drums?: string; // 16스텝 드럼 미니언어 K:/S:/H:
  notes?: string; // 추가 메모
  createdAt: string;
};

// --- 장르 (~펑크로 끝나는 단일 선택) ---
const GENRES = [
  '펑크',
  '클래식펑크',
  '네오펑크',
  '소울펑크',
  '네오소울펑크',
  '지펑크',
  '아프로펑크',
  '재즈펑크',
  '펑크록',
  '부기펑크',
  '누디스코펑크',
];

// --- 분위기 태그 ---
const VIBE_TAGS = [
  '타이트 포켓',
  '싱코페이션',
  '점착 클라브',
  '와와 리듬 기타',
  '슬랩 베이스 악센트',
  '브라스 스탭',
  '콜앤리스폰스',
  '파티 에너지',
  '거친 테이프 질감',
  '모던하고 깔끔함',
];

// --- 악기 프리셋(확장) ---
const INSTRUMENTS = [
  '슬랩 베이스',
  '클라비넷',
  '와와 기타',
  '펑크 기타 팜뮤트',
  '무그 베이스',
  '로즈 피아노',
  '브라스 섹션',
  '톡박스/보코더',
  '아날로그 드럼킷',
  '탐부린/클랩',
  '콩가/카우벨',
  '신스 스트링스',
];

const FORMS: PromptSpec['form'][] = [
  '벌스-코러스',
  'AABA',
  '잼',
  '인트로-그루브-브레이크-아웃트로',
];

const KEYS = ['E minor', 'A minor', 'G minor', 'D minor', 'C minor', 'F minor', 'B minor', 'E Dorian', 'A Dorian'];

// --- 유틸 ---
const nowIso = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 10);

// 16스텝 DSL 검증: 공백으로 분리된 16토큰
const NOTE_RE = /^(?:[A-G](?:#|b)?[0-8]|\.|-|_|!|\?)$/;
function validateDSL(dsl: string): { ok: boolean; reason?: string } {
  const parts = dsl.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 16) return { ok: false, reason: `16스텝이 필요합니다 (현재 ${parts.length})` };
  for (const p of parts) {
    if (!NOTE_RE.test(p)) return { ok: false, reason: `허용되지 않는 토큰: ${p}` };
  }
  return { ok: true };
}

// 드럼 패턴 검증: K:/S:/H: 각 16자 (x 또는 .)
function validateDrums(s: string): { ok: boolean; reason?: string } {
  const mK = s.match(/K:([x.]{16})/i);
  const mS = s.match(/S:([x.]{16})/i);
  const mH = s.match(/H:([x.]{16})/i);
  if (!mK || !mS || !mH) return { ok: false, reason: 'K:/S:/H: 각각 16스텝(x/.)이어야 합니다' };
  return { ok: true };
}

// 프리셋 패턴
const PRESET_DSL = {
  bass_1: 'E2 . E2 _ . . G2 _ _ . A2 . . _ G2 _',
  bass_2: 'E2 ! . . _ G2 . A2 _ . . G2 _ E2 _ .',
};
const PRESET_DRUMS = {
  groove_1: 'K:x..x..x...x..x. S:..x...x...x...x. H:xxxxxxxxxxxxxxxx',
  groove_2: 'K:x...x...x.x...x. S:..x...x...x...x. H:xx.xx.xx.xx.xx.xx',
};

function pick<T>(arr: T[], n = 1) {
  const c = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && c.length; i++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]);
  return (n === 1 ? out[0] : out) as any;
}

function buildPrompt(spec: Omit<PromptSpec, 'id' | 'createdAt'>) {
  const vibe = spec.vibe.join(', ');
  const inst = spec.instruments.join(', ');
  const header = `[장르: ${spec.genre}] [조성: ${spec.key}] [BPM: ${spec.bpm}] [스윙: ${spec.swing}%]`;
  const body = [
    `분위기: ${vibe}.`,
    `악기: ${inst}.`,
    `형식: ${spec.form}.`,
    spec.dsl ? `패턴 DSL(16스텝): ${spec.dsl}` : undefined,
    spec.drums ? `드럼 16스텝(K/S/H): ${spec.drums}` : undefined,
    spec.notes ? `메모: ${spec.notes}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');
  return `${header}\n${body}`.trim();
}

// --- iOS 감성의 심플 UI ---
export default function FunkPromptKorean() {
  const [bpm, setBpm] = useState(98);
  const [key, setKey] = useState(KEYS[0]);
  const [swing, setSwing] = useState(12);
  const [genre, setGenre] = useState<string>('네오소울펑크');
  const [vibe, setVibe] = useState<string[]>(['타이트 포켓', '와와 리듬 기타', '브라스 스탭']);
  const [inst, setInst] = useState<string[]>(['슬랩 베이스', '클라비넷', '와와 기타', '아날로그 드럼킷']);
  const [form, setForm] = useState<PromptSpec['form']>('벌스-코러스');
  const [dsl, setDsl] = useState(PRESET_DSL.bass_1);
  const [drums, setDrums] = useState(PRESET_DRUMS.groove_1);
  const [notes, setNotes] = useState('베이스 고스트노트를 16분 싱코페이션으로; 4마디마다 드럼 필인.');

  const [out, setOut] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const dslCheck = useMemo(() => (dsl ? validateDSL(dsl) : { ok: true }), [dsl]);
  const drumCheck = useMemo(() => (drums ? validateDrums(drums) : { ok: true }), [drums]);

  function toggle<T>(v: T, arr: T[], set: (s: T[]) => void) {
    set(arr.includes(v as any) ? arr.filter(x => x !== v) : [...arr, v as any]);
  }

  function randomize() {
    setBpm(90 + Math.floor(Math.random() * 21));
    setKey(pick(KEYS));
    setSwing([8, 10, 12, 14, 16, 18, 22][Math.floor(Math.random() * 7)]);
    setGenre(pick(GENRES));
    setVibe(pick(VIBE_TAGS, 3));
    setInst(pick(INSTRUMENTS, 4));
    setForm(pick(FORMS));
    setDsl(Math.random() > 0.5 ? PRESET_DSL.bass_1 : PRESET_DSL.bass_2);
    setDrums(Math.random() > 0.5 ? PRESET_DRUMS.groove_1 : PRESET_DRUMS.groove_2);
    setNotes('16분 싱코페이션과 업비트 클랩 강조, 4마디마다 브레이크.');
    setOut('');
    setErr(null);
  }

  function generate() {
    const spec: Omit<PromptSpec, 'id' | 'createdAt'> = {
      bpm,
      key,
      swing,
      genre,
      vibe,
      instruments: inst,
      form,
      dsl,
      drums,
      notes,
    };
    const d1 = dsl ? validateDSL(dsl) : { ok: true };
    const d2 = drums ? validateDrums(drums) : { ok: true };
    if (!d1.ok) return setErr(`패턴 오류: ${d1.reason}`);
    if (!d2.ok) return setErr(`드럼 패턴 오류: ${d2.reason}`);
    setErr(null);
    setOut(buildPrompt(spec));
  }

  function copyOut() {
    navigator.clipboard.writeText(out || '');
  }

  function downloadJSON() {
    const spec: PromptSpec = {
      id: `ps_${rid()}`,
      bpm,
      key,
      swing,
      genre,
      vibe,
      instruments: inst,
      form,
      dsl,
      drums,
      notes,
      createdAt: nowIso(),
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // iPhone 느낌의 여백/모서리/폰트(시스템 폰트)
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
      <div className="max-w-[420px] mx-auto p-4 space-y-6">
        {/* 상단 바 */}
        <header className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70 bg-neutral-950/90 border-b border-neutral-900 py-3">
          <h1 className="text-center text-lg font-semibold tracking-tight">FUNK 프롬프트 생성기 (KR Mini)</h1>
        </header>

        {/* 카드: 기본 설정 */}
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-1 text-xs opacity-80">
              BPM
              <input
                type="number"
                min={70}
                max={140}
                value={bpm}
                onChange={e => setBpm(parseInt(e.target.value || '0'))}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-2 text-sm"
              />
            </label>
            <label className="col-span-1 text-xs opacity-80">
              조성
              <select
                value={key}
                onChange={e => setKey(e.target.value)}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-2 text-sm"
              >
                {KEYS.map(k => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-1 text-xs opacity-80">
              스윙 %
              <input
                type="number"
                min={0}
                max={60}
                value={swing}
                onChange={e => setSwing(parseInt(e.target.value || '0'))}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-2 text-sm"
              />
            </label>
          </div>

          <div>
            <div className="text-xs mb-1 opacity-80">장르 (~펑크)</div>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(g => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={`px-3 py-1.5 rounded-full border text-sm ${genre === g ? 'bg-emerald-600/20 border-emerald-500' : 'bg-neutral-900 border-neutral-700'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

            <div>
              <div className="text-xs mb-1 opacity-80">분위기 태그</div>
              <div className="flex flex-wrap gap-2">
                {VIBE_TAGS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggle(s, vibe, setVibe)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${vibe.includes(s) ? 'bg-fuchsia-600/20 border-fuchsia-500' : 'bg-neutral-900 border-neutral-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs mb-1 opacity-80">악기 프리셋</div>
              <div className="flex flex-wrap gap-2">
                {INSTRUMENTS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggle(s, inst, setInst)}
                    className={`px-3 py-1.5 rounded-full border text-sm ${inst.includes(s) ? 'bg-sky-600/20 border-sky-500' : 'bg-neutral-900 border-neutral-700'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs opacity-80">
                형식
                <select
                  value={form}
                  onChange={e => setForm(e.target.value as any)}
                  className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-2 text-sm"
                >
                  {FORMS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
        </section>

        {/* 카드: 패턴 입력 */}
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <label className="text-xs opacity-80">
              패턴 DSL (16스텝) — 허용: C4/G#2/.,-,_,!,?
              <textarea
                value={dsl}
                onChange={e => setDsl(e.target.value)}
                rows={3}
                className={`mt-1 w-full bg-neutral-900 border rounded-xl p-2 text-sm ${dslCheck.ok ? 'border-neutral-800' : 'border-red-500'}`}
              ></textarea>
            </label>
            {!dslCheck.ok && <p className="text-xs text-red-400 mt-1">{dslCheck.reason}</p>}
          </div>

          <div>
            <label className="text-xs opacity-80">
              드럼 16스텝 (K/S/H) — 예: K:x..x..x...x..x. S:..x...x...x...x. H:xxxxxxxxxxxxxxxx
              <textarea
                value={drums}
                onChange={e => setDrums(e.target.value)}
                rows={3}
                className={`mt-1 w-full bg-neutral-900 border rounded-xl p-2 text-sm ${drumCheck.ok ? 'border-neutral-800' : 'border-red-500'}`}
              ></textarea>
            </label>
            {!drumCheck.ok && <p className="text-xs text-red-400 mt-1">{drumCheck.reason}</p>}
          </div>

          <div>
            <label className="text-xs opacity-80">
              메모(선택)
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl p-2 text-sm"
              ></textarea>
            </label>
          </div>
        </section>

        {/* 액션 바 */}
        <div className="grid grid-cols-4 gap-2">
          <button className="h-11 rounded-2xl bg-neutral-900 border border-neutral-800 active:scale-[0.99]" onClick={randomize}>
            랜덤
          </button>
          <button className="h-11 rounded-2xl bg-white text-black font-medium active:scale-[0.99]" onClick={generate}>
            생성
          </button>
          <button
            className="h-11 rounded-2xl bg-neutral-900 border border-neutral-800 disabled:opacity-40 active:scale-[0.99]"
            disabled={!out}
            onClick={copyOut}
          >
            복사
          </button>
          <button className="h-11 rounded-2xl bg-neutral-900 border border-neutral-800 active:scale-[0.99]" onClick={downloadJSON}>
            JSON
          </button>
        </div>

        {/* 출력 */}
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">출력</h2>
            {err && <span className="text-xs text-red-400">{err}</span>}
          </div>
          <pre className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-3 text-sm whitespace-pre-wrap min-h-[120px]">
            {out || '(생성 버튼을 눌러 프롬프트를 만들어 보세요)'}
          </pre>
        </section>

        <footer className="pb-10 text-[11px] text-neutral-400 text-center">
          FUNK 프롬프트 생성기 • iOS 스타일 미니멀 UI • {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
