import React from 'react';

interface FunkState {
  loading: boolean;
  error?: string;
  text?: string;
  debug?: any;
  length?: number;
}

export default function FunkNaturalPage(){
  const [sub1, setSub1] = React.useState('P-Funk');
  const [sub2, setSub2] = React.useState('G-Funk');
  const [bpm, setBpm] = React.useState(106);
  const [groove, setGroove] = React.useState('swung 16th hats, tight backbeat');
  const [fx1, setFx1] = React.useState('tape saturation');
  const [fx2, setFx2] = React.useState('light plate reverb');
  const [mix1, setMix1] = React.useState('punchy');
  const [mix2, setMix2] = React.useState('warm');
  const [includeLen, setIncludeLen] = React.useState(true);
  const [result, setResult] = React.useState<FunkState>({ loading:false });

  async function run(){
    setResult({ loading: true });
    try {
      const body = {
        substyles: [sub1, sub2].filter(Boolean),
        bpm: Number(bpm)||undefined,
        groove: groove||undefined,
        fx: [fx1, fx2].filter(Boolean),
        mix: [mix1, mix2].filter(Boolean),
        includeLengthHint: includeLen,
        arrangement: [ { section: 'intro', bars: 8 }, { section:'hook', bars:16 }, { section:'break', bars:8 }, { section:'hook', bars:16 } ]
      };
      const r = await fetch('/music/prompt-natural?debug=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'HTTP '+r.status);
      setResult({ loading:false, text: data.text, length: data.length, debug: data.debug });
    } catch(e:any){
      setResult({ loading:false, error: e.message });
    }
  }

  return (
    <div className="p-4 max-w-3xl mx-auto text-sm space-y-4">
      <h1 className="text-lg font-semibold tracking-wide">Funk Natural Prompt</h1>
      <p className="text-slate-400 leading-relaxed">200자 이내로 자동 압축되는 Funk 전용 자연어 프롬프트 생성기. 디버그: 축소 단계 / 다양성 / 압축률.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-slate-500">Substyle 1</span>
            <input value={sub1} onChange={e=>setSub1(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Substyle 2</span>
            <input value={sub2} onChange={e=>setSub2(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">BPM</span>
            <input type="number" value={bpm} onChange={e=>setBpm(Number(e.target.value))} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Groove</span>
            <input value={groove} onChange={e=>setGroove(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">FX 1</span>
            <input value={fx1} onChange={e=>setFx1(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">FX 2</span>
            <input value={fx2} onChange={e=>setFx2(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Mix 1</span>
            <input value={mix1} onChange={e=>setMix1(e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Mix 2</span>
            <input value={mix2} onChange={e=>setMix2(e.target.value)} className="input" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={includeLen} onChange={e=>setIncludeLen(e.target.checked)} /> 길이 힌트 포함
          </label>
          <button disabled={result.loading} onClick={run} className="btn px-3 py-2">{result.loading ? '생성 중…' : '프롬프트 생성'}</button>
        </div>
        <div className="space-y-3">
          <div className="p-3 rounded bg-slate-800/50 border border-slate-700 min-h-[140px] text-xs whitespace-pre-wrap">
            {result.error && <div className="text-red-400">에러: {result.error}</div>}
            {!result.error && result.text && (
              <>
                <div className="font-mono text-amber-200">{result.text}</div>
                <div className="mt-2 text-slate-400">길이: {result.length}자</div>
              </>
            )}
            {!result.error && !result.text && !result.loading && <div className="text-slate-600">아직 생성 전입니다.</div>}
            {result.loading && <div className="animate-pulse text-slate-500">생성 중…</div>}
          </div>
          {result.debug && (
            <details className="bg-slate-900/60 p-3 rounded border border-slate-700" open>
              <summary className="cursor-pointer text-xs text-slate-400 mb-2">디버그</summary>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>originalLength: {result.debug.originalLength}</div>
                <div>compressionRatio: {result.debug.compressionRatio}</div>
                <div>diversity: {result.debug.diversity}</div>
                <div>truncated: {String(result.debug.truncated)}</div>
                <div className="col-span-2">warnings: {result.debug.warnings?.join(', ')||'(없음)'}</div>
              </div>
              <div className="mt-2 text-[10px] space-y-1">
                <div className="font-semibold text-slate-400">stages</div>
                {result.debug.stages?.map((s:any,i:number)=>(
                  <div key={i} className="flex justify-between font-mono">
                    <span>{s.label}</span><span>{s.length}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
