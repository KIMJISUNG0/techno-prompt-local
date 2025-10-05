import React from 'react';
import * as Tone from 'tone';

// Utility: limited push FIFO
function pushLimited(list: string[], value: string, max: number) {
  if (list.includes(value)) return list;
  const next = [...list, value];
  if (next.length > max) next.shift();
  return next;
}
function toggleLimited(list: string[], value: string, max: number) {
  return list.includes(value) ? list.filter(v => v !== value) : pushLimited(list, value, max);
}

type SectionType = 'intro' | 'verse' | 'pre' | 'hook' | 'bridge' | 'break' | 'outro';

const SUBSTYLE_PRESETS = ['P-Funk','G-Funk','Disco-funk','Jazz-funk','Modern funk','Funk rock'];
const MOOD_PRESETS = ['greasy','uplift','syncopated','dark','bright','laid-back','energetic','dense','minimal'];
const FX_PRESETS = ['tape saturation','light plate reverb','spring reverb','phaser','chorus','delay slap'];
const MIX_PRESETS = ['punchy','warm','glossy','vintage','dry','wide','tight'];
const INSTRUMENT_CATEGORIES: Record<string,string[]> = {
  Drums:['tight funk kit','dry kit','snare ghost kit','percussion'],
  Bass:['slap bass','finger bass','sub bass'],
  Guitar:['wah guitar','chank guitar','clean comp guitar','muted riff guitar'],
  Keys:['clav','rhodes','ep piano','organ stab'],
  Brass:['horn stabs','brass hits'],
  Strings:['strings pad'],
  Lead:['synth lead','talkbox lead']
};

interface FunkState { loading:boolean; error?:string; data?:any }

export default function FunkNaturalPage(){
  const [step,setStep] = React.useState(0);
  // Step 0
  const [substyles,setSubstyles] = React.useState<string[]>(['P-Funk','G-Funk']);
  // Step 1
  const [instruments,setInstruments] = React.useState<string[]>(['tight funk kit','slap bass','wah guitar','clav','horn stabs','synth lead']);
  // Step 2
  const [groove,setGroove] = React.useState('swung 16th hats, tight backbeat');
  const [moods,setMoods] = React.useState<string[]>(['greasy']);
  const [fx,setFx] = React.useState<string[]>(['tape saturation','light plate reverb']);
  const [mix,setMix] = React.useState<string[]>(['punchy','warm']);
  // Step 3
  const [bpm,setBpm] = React.useState(106);
  const [meter,setMeter] = React.useState<'4/4'|'3/4'|'6/8'>('4/4');
  const [key,setKey] = React.useState('');
  const [includeLen,setIncludeLen] = React.useState(true);
  const [sections,setSections] = React.useState<{id:string;section:SectionType;bars:number}[]>([
    {id:'s1',section:'intro',bars:8},
    {id:'s2',section:'hook',bars:16},
    {id:'s3',section:'break',bars:8},
    {id:'s4',section:'hook',bars:16},
  ]);

  const [state,setState] = React.useState<FunkState>({loading:false});

  // Metronome
  const [metPlaying,setMetPlaying] = React.useState(false);
  const [metBeat,setMetBeat] = React.useState(0);
  const metEventRef = React.useRef<number|null>(null);
  const highRef = React.useRef<Tone.Synth|null>(null);
  const lowRef = React.useRef<Tone.Synth|null>(null);
  React.useEffect(()=>{ if(!highRef.current) highRef.current=new Tone.Synth().toDestination(); if(!lowRef.current) lowRef.current=new Tone.Synth().toDestination(); },[]);
  React.useEffect(()=>{ Tone.Transport.bpm.value=bpm; if(meter==='6/8') Tone.Transport.timeSignature=[6,8]; else Tone.Transport.timeSignature=[Number(meter[0]),4]; },[bpm,meter]);
  function stopMet(){ if(metEventRef.current!=null){ Tone.Transport.clear(metEventRef.current); metEventRef.current=null; } Tone.Transport.stop(); setMetPlaying(false); setMetBeat(0); }
  async function toggleMet(){ if(metPlaying) return stopMet(); await Tone.start(); const beatsPerBar = meter==='6/8'?6:meter==='3/4'?3:4; const interval = meter==='6/8'?'8n':'4n'; let beat=0; if(metEventRef.current!=null) Tone.Transport.clear(metEventRef.current); metEventRef.current = Tone.Transport.scheduleRepeat((time)=>{ (beat%beatsPerBar===0?highRef:lowRef).current?.triggerAttackRelease(beat%beatsPerBar===0?'C6':'C4','16n',time); beat=(beat+1)%beatsPerBar; setMetBeat(beat); }, interval); Tone.Transport.start('+0.05'); setMetPlaying(true); }

  const totalBars = sections.reduce((s,r)=> s + (r.bars>0?r.bars:0),0);
  const beatsPerBar = meter==='6/8'?6:meter==='3/4'?3:4;
  const estSeconds = Math.round(totalBars*beatsPerBar*(60/Math.max(1,bpm)));
  const estMMSS = `${Math.floor(estSeconds/60)}:${String(estSeconds%60).padStart(2,'0')}`;
  function updateSection(id:string,patch:Partial<{section:SectionType;bars:number}>){ setSections(ss=> ss.map(x=> x.id===id?{...x,...patch}:x)); }
  function addSection(){ setSections(ss=> [...ss,{id:crypto.randomUUID?.().slice(0,6) || Date.now().toString(36), section:'hook', bars:8}]); }
  function removeSection(id:string){ setSections(ss=> ss.length>1? ss.filter(x=> x.id!==id): ss); }

  const charCount = state.data?.length || 0;
  const compressed = state.data?.text || '';
  const readableRaw = state.data?.debug?.originalText || '';
  const readable = React.useMemo(()=>{ if(!readableRaw) return ''; if(readableRaw.length<=300) return readableRaw; const soft = readableRaw.slice(0,300).replace(/\s+\S*$/,''); return /[.!?]$/.test(soft)?soft:soft+'...'; },[readableRaw]);

  async function generate(){
    setState({loading:true});
    try {
      const arrangement = sections.map(s=> ({section:s.section, bars:s.bars}));
      const grooveFull = moods.length? `${groove}; moods: ${moods.join(', ')}`: groove;
      const body = {
        substyles: substyles.slice(0,3),
        bpm,
        meter,
        key: key.trim()||undefined,
        groove: grooveFull,
        instruments: instruments.slice(0,6),
        fx: fx.slice(0,2),
        mix: mix.slice(0,2),
        includeLengthHint: includeLen,
        arrangement
      };
      const r = await fetch('/music/prompt-natural?debug=1', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      const data = await r.json();
      if(!r.ok) throw new Error(data?.error || ('HTTP '+r.status));
      setState({loading:false,data});
      setStep(4);
    } catch(e:any){
      setState({loading:false,error:e.message});
    }
  }

  function next(){ setStep(s=> Math.min(4,s+1)); }
  function prev(){ setStep(s=> Math.max(0,s-1)); }

  const StepNav = () => (
    <div className="flex gap-2 items-center mb-6 flex-wrap">
      {[0,1,2,3,4].map(i=> <button key={i} onClick={()=> setStep(i)} className={(i===step?'bg-amber-500 text-black':'bg-slate-700 text-slate-300')+" px-4 py-2 rounded-full text-xs font-semibold"}>{['스타일','악기','Groove/Mood/FX','길이/어레인지','결과'][i]}</button>)}
      <div className="text-[10px] text-slate-500 ml-auto">Compressed: {charCount}/200</div>
    </div>
  );
  const Chip = (p:{on:boolean;label:string;onClick:()=>void;color?:string}) => <button onClick={p.onClick} className={(p.on?(p.color||'bg-emerald-500 text-black'):'bg-slate-700 text-slate-300 hover:bg-slate-600')+" px-4 py-3 rounded-xl text-sm font-medium"}>{p.label}</button>;
  const CopyBtn = ({text}:{text:string}) => { const [ok,setOk]=React.useState(false); return <button onClick={()=>{ navigator.clipboard.writeText(text||''); setOk(true); setTimeout(()=> setOk(false),1000); }} disabled={!text} className={(text?'bg-slate-700 hover:bg-slate-600':'bg-slate-800 text-slate-500 cursor-not-allowed')+" px-2 py-1 rounded text-[10px]"}>{ok?'복사됨':'복사'}</button>; };
  const DebugPanel = ({debug}:{debug:any}) => (
    <details className="bg-slate-900/60 p-4 rounded border border-slate-700" open>
      <summary className="cursor-pointer text-xs text-slate-400 mb-2">디버그 상세</summary>
      <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
        <div>originalLength:{debug.originalLength}</div>
        <div>compressionRatio:{debug.compressionRatio}</div>
        <div>diversity:{debug.diversity}</div>
        <div>truncated:{String(debug.truncated)}</div>
        <div className="col-span-2">warnings:{debug.warnings?.join(', ')||'(없음)'}</div>
      </div>
      <div className="font-semibold text-slate-400 text-[11px] mb-1">stages</div>
      <div className="max-h-40 overflow-auto pr-2 space-y-1 text-[10px] font-mono">
        {debug.stages?.map((s:any,i:number)=><div key={i} className="flex justify-between"><span>{s.label}</span><span>{s.length}</span></div>)}
      </div>
    </details>
  );

  function renderStep(){
    switch(step){
      case 0: return (
        <div className="space-y-6">
          <h2 className="text-base font-semibold">1. 스타일 (최대3)</h2>
          <div className="flex flex-wrap gap-4">{SUBSTYLE_PRESETS.map(s=> <Chip key={s} label={s} on={substyles.includes(s)} onClick={()=> setSubstyles(p=> toggleLimited(p,s,3))} />)}</div>
          <div className="text-xs text-slate-500">{substyles.join(', ')||'선택 없음'}</div>
          <div className="flex gap-3"><button className="btn" onClick={next}>다음 →</button></div>
        </div>
      );
      case 1: return (
        <div className="space-y-6">
          <h2 className="text-base font-semibold">2. 악기 (최대6)</h2>
          {Object.entries(INSTRUMENT_CATEGORIES).map(([cat,list])=> (
            <div key={cat} className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">{cat}</div>
              <div className="flex flex-wrap gap-3">{list.map(inst=> <Chip key={inst} label={inst} on={instruments.includes(inst)} onClick={()=> setInstruments(p=> toggleLimited(p,inst,6))} />)}</div>
            </div>
          ))}
          <div className="text-xs text-slate-500">{instruments.length}개 선택</div>
          <div className="flex gap-3"><button className="btn" onClick={prev}>← 이전</button><button className="btn" onClick={next}>다음 →</button></div>
        </div>
      );
      case 2: return (
        <div className="space-y-8">
          <h2 className="text-base font-semibold">3. Groove / Mood / FX / Mix</h2>
          <div className="space-y-3">
            <label className="block text-xs text-slate-400 mb-1">Groove</label>
            <textarea value={groove} onChange={e=> setGroove(e.target.value)} className="w-full rounded bg-slate-800 border border-slate-600 p-3 min-h-[90px]" />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400">Mood (최대3)</div>
            <div className="flex flex-wrap gap-3">{MOOD_PRESETS.map(m=> <Chip key={m} label={m} on={moods.includes(m)} onClick={()=> setMoods(p=> toggleLimited(p,m,3))} color="bg-purple-500 text-black" />)}</div>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">FX (최대2)</div>
              <div className="flex flex-wrap gap-3">{FX_PRESETS.map(f=> <Chip key={f} label={f} on={fx.includes(f)} onClick={()=> setFx(p=> toggleLimited(p,f,2))} color="bg-fuchsia-500 text-black" />)}</div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">Mix (최대2)</div>
              <div className="flex flex-wrap gap-3">{MIX_PRESETS.map(m=> <Chip key={m} label={m} on={mix.includes(m)} onClick={()=> setMix(p=> toggleLimited(p,m,2))} color="bg-cyan-400 text-black" />)}</div>
            </div>
          </div>
          <div className="flex gap-3"><button className="btn" onClick={prev}>← 이전</button><button className="btn" onClick={next}>다음 →</button></div>
        </div>
      );
      case 3: return (
        <div className="space-y-8">
          <h2 className="text-base font-semibold">4. 길이 / 어레인지 / BPM</h2>
          <div className="grid md:grid-cols-4 gap-4">
            <label className="text-xs flex flex-col gap-1">BPM
              <input type="number" value={bpm} onChange={e=> setBpm(Number(e.target.value)||0)} className="input" />
            </label>
            <label className="text-xs flex flex-col gap-1">Meter
              <select value={meter} onChange={e=> setMeter(e.target.value as any)} className="input">
                <option value="4/4">4/4</option>
                <option value="3/4">3/4</option>
                <option value="6/8">6/8</option>
              </select>
            </label>
            <label className="text-xs flex flex-col gap-1">Key
              <input value={key} onChange={e=> setKey(e.target.value)} className="input" placeholder="A minor" />
            </label>
            <label className="flex items-center gap-2 text-xs mt-5">
              <input type="checkbox" checked={includeLen} onChange={e=> setIncludeLen(e.target.checked)} /> 길이 힌트
            </label>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-3">예상 길이: {estMMSS} (bars {totalBars})
            <button onClick={toggleMet} className={(metPlaying?'bg-rose-500 text-black':'bg-slate-700 text-slate-300 hover:bg-slate-600')+" px-3 py-1 rounded"}>{metPlaying?'메트로놈 정지':'메트로놈 재생'}</button>
            {metPlaying && <span className="flex gap-1">{Array.from({length:beatsPerBar}).map((_,i)=><span key={i} className={'w-2 h-2 rounded-full '+(i===metBeat?'bg-amber-400':'bg-slate-600')}></span>)}</span>}
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-semibold">Arrangement
              <button onClick={addSection} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">+ 추가</button>
            </div>
            <div className="space-y-2">
              {sections.map(s=> <div key={s.id} className="flex gap-2 items-center bg-slate-800/40 p-2 rounded">
                <select value={s.section} onChange={e=> updateSection(s.id,{section:e.target.value as SectionType})} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs">
                  <option value="intro">intro</option>
                  <option value="verse">verse</option>
                  <option value="pre">pre</option>
                  <option value="hook">hook</option>
                  <option value="bridge">bridge</option>
                  <option value="break">break</option>
                  <option value="outro">outro</option>
                </select>
                <input type="number" value={s.bars} onChange={e=> updateSection(s.id,{bars:Number(e.target.value)})} className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs" />
                <button onClick={()=> removeSection(s.id)} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">삭제</button>
              </div>)}
            </div>
          </div>
          <div className="flex gap-3"><button className="btn" onClick={prev}>← 이전</button><button className="btn" onClick={generate} disabled={state.loading}>{state.loading?'생성 중…':'프롬프트 생성'}</button></div>
        </div>
      );
      case 4: return (
        <div className="space-y-8">
          <h2 className="text-base font-semibold">5. 결과</h2>
          {state.error && <div className="text-red-400 text-sm">에러: {state.error}</div>}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300"><span>Readable (원문)</span><CopyBtn text={readable} /></div>
              <div className="p-3 rounded bg-slate-800/60 border border-slate-600 min-h-[140px] text-xs whitespace-pre-wrap">{readable || '없음'}</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300"><span>Compressed (≤200)</span><CopyBtn text={compressed} /></div>
              <div className="p-3 rounded bg-slate-800/60 border border-slate-600 min-h-[140px] text-xs whitespace-pre-wrap">{compressed || '없음'}</div>
              <div className="text-[10px] text-slate-500">{charCount} chars / 200</div>
            </div>
          </div>
          {state.data?.debug && <DebugPanel debug={state.data.debug} />}
          <div className="flex gap-3"><button className="btn" onClick={()=> setStep(0)}>다시 설정</button><button className="btn" onClick={()=> generate()} disabled={state.loading}>{state.loading?'재생성…':'재생성'}</button></div>
        </div>
      );
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto text-sm">
      <h1 className="text-xl font-semibold mb-4 tracking-wide">Funk Natural Wizard</h1>
      <StepNav />
      {renderStep()}
    </div>
  );
}

