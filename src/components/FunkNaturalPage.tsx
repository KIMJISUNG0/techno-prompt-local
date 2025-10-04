import React from 'react';

interface FunkState { loading: boolean; error?: string; text?: string; debug?: any; length?: number; }
type SectionType = 'intro'|'verse'|'pre'|'hook'|'bridge'|'break'|'outro';

const SUBSTYLE_PRESETS = ['P-Funk','G-Funk','Disco-funk','Jazz-funk','Modern funk'];
const INSTRUMENT_BANK = [
  'tight funk kit','slap bass','finger bass','wah guitar','chank guitar','clav','rhodes','horn stabs','synth lead','talkbox lead','brass hits','strings pad','ep piano','guitar chucks','percussion'
];
const FX_PRESETS = ['tape saturation','light plate reverb','spring reverb','phaser','chorus'];
const MIX_PRESETS = ['punchy','warm','glossy','vintage','dry','wide'];

export default function FunkNaturalPage(){
  // 기본 상태
  const [substyles, setSubstyles] = React.useState<string[]>(['P-Funk','G-Funk']);
  const [bpm, setBpm] = React.useState(106);
  const [meter, setMeter] = React.useState<'4/4'|'3/4'|'6/8'>('4/4');
  const [key, setKey] = React.useState('');
  const [groove, setGroove] = React.useState('swung 16th hats, tight backbeat');
  const [fxTokens, setFxTokens] = React.useState<string[]>(['tape saturation','light plate reverb']);
  const [mixTokens, setMixTokens] = React.useState<string[]>(['punchy','warm']);
  const [selInstruments, setSelInstruments] = React.useState<string[]>(['bass','wah guitar','clav','horn stabs','rhodes','synth lead']);
  const [includeLen, setIncludeLen] = React.useState(true);
  const [sections, setSections] = React.useState<{ id:string; section: SectionType; bars: number }[]>([
    { id: 's1', section: 'intro', bars: 8 },
    { id: 's2', section: 'hook', bars: 16 },
    { id: 's3', section: 'break', bars: 8 },
    { id: 's4', section: 'hook', bars: 16 }
  ]);
  const [result, setResult] = React.useState<FunkState>({ loading:false });

  // 유틸
  function toggle<T>(arr:T[], v:T, max?:number){
    const has = arr.includes(v);
    const next = has ? arr.filter(x=>x!==v) : (max && arr.length>=max ? arr : [...arr, v]);
    return next;
  }

  function updateSection(id:string, patch: Partial<{section:SectionType; bars:number}>){
    setSections(s => s.map(row => row.id===id ? { ...row, ...patch } : row));
  }
  function addSection(){
    setSections(s => [...s, { id: 's'+(Date.now().toString(36)+Math.random().toString(36).slice(2,5)), section:'hook', bars:8 }]);
  }
  function removeSection(id:string){
    setSections(s => s.length>1 ? s.filter(r=>r.id!==id) : s); // 최소 1개 유지
  }
  const totalBars = sections.reduce((sum,s)=> sum + (s.bars>0? s.bars:0), 0);
  const beatsPerBar = meter==='6/8'?6: meter==='3/4'?3:4;
  const estSeconds = Math.round(totalBars * beatsPerBar * (60 / Math.max(1,bpm)));
  const estMMSS = `${Math.floor(estSeconds/60)}:${String(estSeconds%60).padStart(2,'0')}`;

  function setSubstyleChecked(name:string, checked:boolean){
    setSubstyles(prev => checked ? (prev.includes(name)? prev : (prev.length>=2 ? [prev[0], name] : [...prev, name])) : prev.filter(x=>x!==name));
  }

  function handleFxToggle(token:string){ setFxTokens(t => toggle(t, token, 2)); }
  function handleMixToggle(token:string){ setMixTokens(t => toggle(t, token, 2)); }
  function handleInstrToggle(inst:string){ setSelInstruments(t => toggle(t, inst, 6)); }

  async function run(){
    setResult({ loading: true });
    try {
      const body = {
        substyles: substyles.slice(0,2),
        bpm: Number(bpm)||undefined,
        meter,
        key: key.trim() || undefined,
        groove: groove||undefined,
        fx: fxTokens.slice(0,2),
        mix: mixTokens.slice(0,2),
        instruments: selInstruments.slice(0,6),
        includeLengthHint: includeLen,
        arrangement: sections.map(s=> ({ section: s.section, bars: s.bars }))
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
    <div className="p-4 max-w-6xl mx-auto text-sm space-y-6">
      <h1 className="text-lg font-semibold tracking-wide">Funk Natural Prompt (세부 선택)</h1>
      <p className="text-slate-400 leading-relaxed">장르/악기/FX/믹스/어레인지먼트를 모두 개별 선택해서 200자 이내 Funk 자연어 프롬프트를 구성합니다. (최대 Substyle 2, FX 2, Mix 2, Instruments 6)</p>

      {/* Substyle & Tempo Row */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-400">Substyles (최대 2)</div>
          <div className="flex flex-wrap gap-2">
            {SUBSTYLE_PRESETS.map(s => {
              const on = substyles.includes(s);
              return <button key={s} onClick={()=> setSubstyleChecked(s, !on)} className={(on?'bg-amber-500 text-black':'bg-slate-700 text-slate-300 hover:bg-slate-600')+ ' px-2 py-1 rounded text-[11px]'}>{s}</button>;
            })}
          </div>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-slate-500">BPM</span>
            <input type="number" value={bpm} onChange={e=>setBpm(Number(e.target.value))} className="input" />
          </label>
          <div className="flex gap-4">
            <label className="flex flex-col w-1/2 text-xs text-slate-500">Meter
              <select value={meter} onChange={e=> setMeter(e.target.value as any)} className="input mt-1">
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
              </select>
            </label>
            <label className="flex flex-col w-1/2 text-xs text-slate-500">Key (선택)
              <input value={key} onChange={e=> setKey(e.target.value)} placeholder="e.g. A minor" className="input mt-1" />
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-slate-500">Groove 설명</span>
            <input value={groove} onChange={e=>setGroove(e.target.value)} className="input" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <input type="checkbox" checked={includeLen} onChange={e=>setIncludeLen(e.target.checked)} /> 길이 힌트 포함
          </label>
          <div className="text-[11px] text-slate-500">예상 길이: {estMMSS} (bars {totalBars})</div>
        </div>
      </div>

      {/* Instruments */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-slate-400">Instruments (최대 6)</div>
          <div className="text-[10px] text-slate-500">선택 {selInstruments.length}/6</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENT_BANK.map(inst => {
            const on = selInstruments.includes(inst);
            return <button key={inst} onClick={()=> handleInstrToggle(inst)} className={(on?'bg-emerald-500 text-black':'bg-slate-700 text-slate-300 hover:bg-slate-600')+ ' px-2 py-1 rounded text-[11px]'}>{inst}</button>;
          })}
        </div>
        {selInstruments.length===0 && <div className="text-[11px] text-red-400">최소 1개 이상 선택하세요 (없으면 기본 세트로 대체)</div>}
      </div>

      {/* FX / Mix */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-400">FX (최대 2)</div>
            <div className="text-[10px] text-slate-500">{fxTokens.length}/2</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {FX_PRESETS.map(fx => {
              const on = fxTokens.includes(fx);
              return <button key={fx} onClick={()=> handleFxToggle(fx)} className={(on?'bg-fuchsia-500 text-black':'bg-slate-700 text-slate-300 hover:bg-slate-600')+ ' px-2 py-1 rounded text-[11px]'}>{fx}</button>;
            })}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-400">Mix (최대 2)</div>
            <div className="text-[10px] text-slate-500">{mixTokens.length}/2</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MIX_PRESETS.map(mx => {
              const on = mixTokens.includes(mx);
              return <button key={mx} onClick={()=> handleMixToggle(mx)} className={(on?'bg-cyan-400 text-black':'bg-slate-700 text-slate-300 hover:bg-slate-600')+ ' px-2 py-1 rounded text-[11px]'}>{mx}</button>;
            })}
          </div>
        </div>
      </div>

      {/* Arrangement Editor */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold text-slate-400">Arrangement (섹션 / bars)</div>
          <button onClick={addSection} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px]">+ 섹션 추가</button>
        </div>
        <div className="space-y-2">
          {sections.map(row => (
            <div key={row.id} className="flex items-center gap-2 text-[11px] bg-slate-800/40 p-2 rounded">
              <select value={row.section} onChange={e=> updateSection(row.id, { section: e.target.value as SectionType })} className="px-2 py-1 rounded bg-slate-900 border border-slate-700">
                <option value="intro">intro</option>
                <option value="verse">verse</option>
                <option value="pre">pre</option>
                <option value="hook">hook</option>
                <option value="bridge">bridge</option>
                <option value="break">break</option>
                <option value="outro">outro</option>
              </select>
              <input type="number" min={1} value={row.bars} onChange={e=> updateSection(row.id, { bars: Number(e.target.value) })} className="w-20 px-2 py-1 rounded bg-slate-900 border border-slate-700" />
              <button onClick={()=> removeSection(row.id)} className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600">삭제</button>
            </div>
          ))}
        </div>
      </div>

      {/* Generate & Output */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <button disabled={result.loading} onClick={run} className="btn px-3 py-2 w-full">{result.loading ? '생성 중…' : '프롬프트 생성'}</button>
          <div className="text-[11px] text-slate-500 leading-relaxed">
            - Substyle 2, FX 2, Mix 2, Instruments 6 초과 선택 시 자동 잘림<br/>
            - 길이 200자 초과 시 단계별 축소 및 hard-truncate<br/>
            - Arrangement 길이 힌트: 선택 시 포함 (필요 시 자동 제거)
          </div>
        </div>
        <div className="space-y-3">
          <div className="p-3 rounded bg-slate-800/50 border border-slate-700 min-h-[160px] text-xs whitespace-pre-wrap">
            {result.error && <div className="text-red-400">에러: {result.error}</div>}
            {!result.error && result.text && (
              <>
                <div className="font-mono text-amber-200 break-words">{result.text}</div>
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
              <div className="mt-2 text-[10px] space-y-1 max-h-40 overflow-auto pr-2">
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
