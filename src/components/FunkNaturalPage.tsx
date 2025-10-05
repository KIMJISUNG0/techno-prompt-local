import React, { useMemo, useState } from 'react';

// ===== Config (Expanded, No Selection Hard Limits) =====
const SUBSTYLES = [
  'P-Funk','G-Funk','Jazz-funk','Disco-funk','Boogie','Minneapolis','Neo-soul','Afrobeat fusion','Electro-funk','Funk rock','Funk metal','Modern funk'
] as const;
const MOODS = ['groovy','gritty','cosmic','warm','punchy','dark','lush','vintage'] as const;
const FX = ['tape saturation','light plate reverb','spring reverb','phaser','chorus','auto-wah','bit-crush'] as const;
const ERAS = ['60s','70s','80s','90s','2000s','modern'] as const;
const INSTRUMENTS: Record<string,string[]> = {
  Drums:['tight funk kit','snappy snare','crack snare','deep kick','tight kick','swung 16th hats','straight 16th hats','808 hats sprinkle','percussion shakers','congas','claps'],
  Bass:['slap bass','finger bass','pick bass','analog synth bass','Moog mono bass','sub bass'],
  Guitar:['wah comp guitar','muted chanks','clean funk guitar','phaser guitar','chorus guitar','rhythm guitar stabs'],
  Keys:['clav stabs','rhodes EP','wurli EP','grand piano','upright piano','DX-style EP'],
  Brass:['horn stabs','trumpet section','sax section','bone section','full horns'],
  Strings:['disco strings','lush pads','pizzicato strings'],
  Lead:['synth lead','talkbox lead','vocoder line']
};
// Compression codemap & token transforms
const CODEMAP: Record<string,string> = {
  'synth lead':'synthLD','talkbox lead':'tbx','wah comp guitar':'Gwah','muted chanks':'Gmtd','clean funk guitar':'Gcln','phaser guitar':'Gph','chorus guitar':'Gch','clav stabs':'Clv','rhodes EP':'Rhds','wurli EP':'Wrli','grand piano':'Pno','upright piano':'Upno','analog synth bass':'Bsyn','Moog mono bass':'Bmoog','sub bass':'Bsub','slap bass':'Bslap','finger bass':'Bfin','pick bass':'Bpick','horn stabs':'Hrn','trumpet section':'Tpt','sax section':'Sax','bone section':'Bone','full horns':'Horns','disco strings':'Str','tight kick':'Kt','deep kick':'Kdeep','snappy snare':'Ssnap','crack snare':'Scrk','swung 16th hats':'HHsw16','straight 16th hats':'HH16','tape saturation':'tape70s','light plate reverb':'lpl','spring reverb':'spr','phaser':'phs','chorus':'cho','auto-wah':'awah','bit-crush':'bit'
};
type Step = 1|2|3|4|5;
// 편곡 모드 설명 (한국어)
// reinstrument: 하나의 짧은 Hook(후크) 구간이 반복되면서 악기가 조금씩 추가/교체/레이어링되는 방식
// vc (Verse/Chorus): 전형적인 팝/펑크 곡처럼 Verse와 Chorus 구간이 교차하면서 반복되는 구조 (선택적으로 Bridge 포함)
// aaba: 재즈/고전 팝 양식 A-A-B-A 형태. A 섹션 반복 후 B(대비), 마지막에 A 복귀. cycles>1 시 블록 자체가 반복
// build: Intro → Build(점층) → Drop(풀 에너지) → Post(잔향/변형), 필요한 경우 여러 번 Rise(필터 상승, FX swell) 표기
const ARR_MODES = [
  {id:'reinstrument',label:'Reinstrument Hook'},
  {id:'vc',label:'Verse/Chorus'},
  {id:'aaba',label:'AABA'},
  {id:'build',label:'Build & Drop'}
] as const;
const VARIATION_CURVES = [ {id:'layer',label:'Layer Up'}, {id:'swap',label:'Swap Colors'}, {id:'filter-rise',label:'Filter Rise'}, {id:'fx-mutate',label:'FX Mutate'} ] as const;
const REINS_PRESETS: Record<string,string[]> = {
  LAYER_FUNKEVO:['Bsyn+Gwah','Bsyn+Gwah+Clv','Bsyn+Gwah+Clv+Horns','FullEns'],
  SWAP_COLOR:['Bsyn+Clv','Bsyn+Gwah','Bsyn+Rhds','Bsyn+tbx','FullEns'],
  TEXTURE_FILTER:['Gmtd','Gph','Gwah','synthLD','FullEns']
};

interface ReinstrumentState{ hookBars:2|4|8; repeats:number; curve:typeof VARIATION_CURVES[number]['id']; preset?: keyof typeof REINS_PRESETS }
interface VCState { verseBars:number; chorusBars:number; cycles:number; addBridge:boolean; bridgeBars:number }
interface AABAState { aBars:number; bBars:number; cycles:number }
interface BuildState { introBars:number; buildBars:number; dropBars:number; postBars:number; rises:number }
interface ArrangementState{ mode: typeof ARR_MODES[number]['id']; reinstrument: ReinstrumentState; vc: VCState; aaba: AABAState; build: BuildState }
interface PromptState{ substyles:string[]; bpm:number; meterTop:4|3|6; meterBottom:4|8; era:string; instruments:string[]; mood:string[]; fx:string[]; arrangement:ArrangementState; targetSec:number }

const clamp=(v:number,min:number,max:number)=> Math.max(min,Math.min(max,v));
function secondsFromBars(bpm:number,bars:number,meterTop=4){ return ((bars*meterTop)/bpm)*60; }
function toMMSS(sec:number){ const s=Math.round(sec); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

function composeReadable(o:PromptState){
  const head = ['Funk',...o.substyles,`${o.bpm}bpm`].join(' ');
  const body:string[]=[];
  if(o.instruments.length) body.push(o.instruments.join(', '));
  // 편곡 모드별 자연어 설명
  switch(o.arrangement.mode){
    case 'reinstrument': {
      const a=o.arrangement.reinstrument; body.push(`single hook ${a.hookBars} bars repeats ${a.repeats} evolving (${a.curve})`); break; }
    case 'vc': {
      const v=o.arrangement.vc; body.push(`verse ${v.verseBars} / chorus ${v.chorusBars} pattern x${v.cycles}${v.addBridge? ` + bridge ${v.bridgeBars}`:''}`); break; }
    case 'aaba': {
      const a=o.arrangement.aaba; body.push(`A${a.aBars}-A${a.aBars}-B${a.bBars}-A${a.aBars}${a.cycles>1? ` x${a.cycles}`:''}`); break; }
    case 'build': {
      const b=o.arrangement.build; body.push(`intro ${b.introBars} → build ${b.buildBars} → drop ${b.dropBars} → post ${b.postBars} (${b.rises} rises)`); break; }
  }
  if(o.mood.length) body.push(o.mood.join('/'));
  if(o.era) body.push(`${o.era} vibe`);
  if(o.fx.length) body.push(o.fx.join(', '));
  return `${head} ${body.join(', ')}`.trim();
}

function compressToken(t:string){
  return (CODEMAP[t]||t)
    .replace(/analog/gi,'anlg').replace(/vintage/gi,'vtg').replace(/cosmic/gi,'csm')
    .replace(/groovy/gi,'grv').replace(/warm/gi,'wrm').replace(/punchy/gi,'pchy')
    .replace(/(with|and)/gi,'');
}

// Prioritized compression builder (no user-facing caps) -> auto trims low priority tokens
function composeCompressed(o:PromptState){
  const headTokens=['Funk',...o.substyles.map(s=> s.split('-')[0].slice(0,2)),`${o.bpm}bpm`];
  const arrTokens: string[]=[];
  // 구조 토큰: 짧고 구분 가능하게 설계 (200자 압축에서 높은 정보 밀도 유지)
  switch(o.arrangement.mode){
    case 'reinstrument': {
      const a=o.arrangement.reinstrument; arrTokens.push(`H${a.hookBars}x${a.repeats}`, a.curve.replace(/-.*/,'R')); break; }
    case 'vc': {
      const v=o.arrangement.vc; arrTokens.push(`V${v.verseBars}C${v.chorusBars}x${v.cycles}`); if(v.addBridge) arrTokens.push(`Br${v.bridgeBars}`); break; }
    case 'aaba': {
      const a=o.arrangement.aaba; arrTokens.push(`A${a.aBars}A${a.aBars}B${a.bBars}A${a.aBars}`); if(a.cycles>1) arrTokens.push(`x${a.cycles}`); break; }
    case 'build': {
      const b=o.arrangement.build; arrTokens.push(`I${b.introBars}Bld${b.buildBars}D${b.dropBars}P${b.postBars}`, `R${b.rises}`); break; }
  }

  // Categorize instruments for priority ordering
  const prioMap: Record<string,number> = { bass:1, kick:1, snare:1, hat:2, hat16:2, perc:2, conga:2, clap:2, guitar:3, clav:3, rhodes:3, wurli:3, piano:3, ep:3, horn:4, brass:4, sax:4, bone:4, string:5, pad:5, lead:6, talkbox:6, vocoder:6 };
  const instRank = (inst:string)=>{
    const k=inst.toLowerCase();
    for(const key in prioMap){ if(k.includes(key)) return prioMap[key]; }
    return 7; // fallback lowest
  };
  const instShort = o.instruments.map(i=> compressToken(i)).sort((a,b)=> instRank(a)-instRank(b));

  const moodTokens = o.mood.map(m=> compressToken(m));
  const fxTokens = o.fx.map(f=> compressToken(f));
  const eraToken = o.era? [o.era]: [];

  // Build full candidate list in descending priority groups
  const candidates = [instShort, arrTokens, moodTokens, eraToken, fxTokens].flat();
  const outTokens=[...headTokens];
  for(const tok of candidates){
    outTokens.push(tok);
  const test=outTokens.join(' ').replace(/\s+/g,' ').trim();
    if(test.length>200){ // remove last added and stop adding further lower-priority tokens
      outTokens.pop();
      break;
    }
  }
  let out = outTokens.join(' ').replace(/\s+/g,' ').trim();
  if(out.length>200) out = out.slice(0,200).trim();
  return out;
}

const defaultState: PromptState = {
  substyles:['P-Funk','G-Funk'], bpm:106, meterTop:4, meterBottom:4, era:'70s',
  instruments:['analog synth bass','wah comp guitar','clav stabs','rhodes EP','horn stabs','swung 16th hats'],
  mood:['groovy','warm'], fx:['tape saturation'],
  arrangement:{
    mode:'reinstrument',
    reinstrument:{ hookBars:4, repeats:0, curve:'layer', preset:'LAYER_FUNKEVO' },
    vc:{ verseBars:8, chorusBars:8, cycles:4, addBridge:true, bridgeBars:8 },
    aaba:{ aBars:8, bBars:8, cycles:1 },
    build:{ introBars:8, buildBars:16, dropBars:16, postBars:8, rises:2 }
  },
  targetSec:230
};

function calcRepeats(bpm:number,targetSec:number,hookBars:number,meterTop=4){
  const perLoop=secondsFromBars(bpm,hookBars,meterTop); return clamp(Math.round(targetSec/perLoop),4,40);
}
// 비 Hook 모드 길이 추정 헬퍼 (bars 합)
function vcTotalBars(v:VCState){
  const base = (v.verseBars + v.chorusBars) * v.cycles;
  return base + (v.addBridge ? v.bridgeBars : 0);
}
function aabaTotalBars(a:AABAState){
  const block = a.aBars*2 + a.bBars + a.aBars; // A A B A
  return block * a.cycles;
}
function buildTotalBars(b:BuildState){
  return b.introBars + b.buildBars + b.dropBars + b.postBars;
}

export default function FunkNaturalPage(){
  const [step,setStep]=useState<Step>(1);
  const [state,setState]=useState<PromptState>(()=>{ const s={...defaultState}; s.arrangement.reinstrument.repeats=calcRepeats(s.bpm,s.targetSec,s.arrangement.reinstrument.hookBars,s.meterTop); return s; });

  const predictedSec = useMemo(()=>{
    switch(state.arrangement.mode){
      case 'reinstrument': { const a=state.arrangement.reinstrument; return secondsFromBars(state.bpm,a.hookBars*a.repeats,state.meterTop); }
      case 'vc': return secondsFromBars(state.bpm, vcTotalBars(state.arrangement.vc), state.meterTop);
      case 'aaba': return secondsFromBars(state.bpm, aabaTotalBars(state.arrangement.aaba), state.meterTop);
      case 'build': return secondsFromBars(state.bpm, buildTotalBars(state.arrangement.build), state.meterTop);
      default: return secondsFromBars(state.bpm,64,state.meterTop);
    }
  },[state]);
  const readable = useMemo(()=> composeReadable(state),[state]);
  const compressed = useMemo(()=> composeCompressed(state),[state]);

  const toggleChip = (arr:string[], val:string)=> arr.includes(val)? arr.filter(v=> v!==val): [...arr,val];
  const setBpm = (v:number)=> setState(s=> ({...s,bpm:clamp(Math.round(v),60,160)}));
  const setTarget = (sec:number)=> setState(s=> { const next={...s,targetSec:clamp(sec,90,480)}; if(next.arrangement.mode==='reinstrument'){ const a={...next.arrangement.reinstrument}; a.repeats=calcRepeats(next.bpm,next.targetSec,a.hookBars,next.meterTop); next.arrangement={...next.arrangement,reinstrument:a}; } return next; });
  const setHookBars = (bars:2|4|8)=> setState(s=> { const a={...s.arrangement.reinstrument,hookBars:bars}; a.repeats=calcRepeats(s.bpm,s.targetSec,bars,s.meterTop); return {...s,arrangement:{...s.arrangement,reinstrument:a}}; });
  // VC 편집 핸들러
  const updateVC = (patch:Partial<VCState>)=> setState(s=> ({...s, arrangement:{...s.arrangement, vc:{...s.arrangement.vc, ...patch}}}));
  const updateAABA = (patch:Partial<AABAState>)=> setState(s=> ({...s, arrangement:{...s.arrangement, aaba:{...s.arrangement.aaba, ...patch}}}));
  const updateBuild = (patch:Partial<BuildState>)=> setState(s=> ({...s, arrangement:{...s.arrangement, build:{...s.arrangement.build, ...patch}}}));
  const copy = (t:string)=> navigator.clipboard.writeText(t);

  const Chip = ({active,label,onClick}:{active:boolean;label:string;onClick:()=>void}) => <button onClick={onClick} className={`px-4 py-3 rounded-2xl text-sm md:text-base font-medium border transition ${active?'bg-indigo-600 text-white border-indigo-500 shadow-lg':'bg-neutral-800/40 text-neutral-100 border-neutral-700 hover:border-neutral-500'}`}>{label}</button>;
  const Section = ({title,children}:{title:string;children:React.ReactNode})=> <div className="space-y-4"><h3 className="text-lg md:text-xl font-semibold text-neutral-100">{title}</h3>{children}</div>;

  return <div className="min-h-screen w-full bg-neutral-950 text-neutral-50"><div className="max-w-5xl mx-auto px-4 py-8 md:py-10"><h1 className="text-2xl md:text-3xl font-bold mb-6">Funk Prompt Wizard v2</h1>
    <div className="flex gap-2 mb-8 flex-wrap">{[1,2,3,4,5].map(n=> <button key={n} onClick={()=> setStep(n as Step)} className={`px-4 py-2 rounded-full text-sm border ${step===n?'bg-indigo-600 border-indigo-500':'bg-neutral-900 border-neutral-700'}`}>Step {n}</button>)}</div>
    {step===1 && <div className="space-y-8">
      <Section title="Substyles">
        <div className="flex flex-wrap gap-3">{SUBSTYLES.map(s=> <Chip key={s} label={s} active={state.substyles.includes(s)} onClick={()=> setState(st=> ({...st,substyles: toggleChip(st.substyles,s)}))} />)}</div>
      </Section>
      <Section title="Tempo & Target Length">
        <div className="grid md:grid-cols-2 gap-6 items-center"><div><label className="block mb-2 text-sm opacity-80">BPM</label><input type="range" min={70} max={150} value={state.bpm} onChange={e=> setBpm(+e.target.value)} className="w-full" /><div className="mt-2 text-lg">{state.bpm} bpm</div></div><div><label className="block mb-2 text-sm opacity-80">Target Length</label><div className="flex gap-2 flex-wrap">{[180,210,230,240,270].map(sec=> <Chip key={sec} active={state.targetSec===sec} label={toMMSS(sec)} onClick={()=> setTarget(sec)} />)}<input className="bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 w-28" type="number" min={90} max={480} value={state.targetSec} onChange={e=> setTarget(+e.target.value)} /><span className="opacity-70 self-center text-sm">sec</span></div></div></div>
      </Section>
      <Section title="Era">
        <div className="flex flex-wrap gap-3">{ERAS.map(t=> <Chip key={t} label={t} active={state.era===t} onClick={()=> setState(s=> ({...s,era:t}))} />)}</div>
      </Section>
      <div className="flex justify-end"><button className="px-5 py-3 rounded-2xl bg-indigo-600" onClick={()=> setStep(2)}>다음 →</button></div>
    </div>}
    {step===2 && <div className="space-y-8">{Object.entries(INSTRUMENTS).map(([cat,items])=> <Section key={cat} title={cat}><div className="flex flex-wrap gap-3">{items.map(i=> <Chip key={i} label={i} active={state.instruments.includes(i)} onClick={()=> setState(s=> ({...s,instruments: toggleChip(s.instruments,i)}))} />)}</div></Section>)}<div className="flex justify-between"><button className="px-5 py-3 rounded-2xl bg-neutral-800 border border-neutral-700" onClick={()=> setStep(1)}>← 이전</button><button className="px-5 py-3 rounded-2xl bg-indigo-600" onClick={()=> setStep(3)}>다음 →</button></div></div>}
    {step===3 && <div className="space-y-8">
      <Section title="Arrangement Mode">
        <p className="text-xs text-neutral-400 leading-relaxed mb-3">
          원하는 전개 방식을 선택하세요. 각 모드는 곡의 에너지 흐름과 반복 패턴을 다른 방식으로 보여줍니다. (한국어 설명: 위 칩에 마우스를 올리거나 선택해 세부 조정)
        </p>
        <div className="flex flex-wrap gap-3">{ARR_MODES.map(m=> <Chip key={m.id} label={m.label} active={state.arrangement.mode===m.id} onClick={()=> setState(s=> ({...s,arrangement:{...s.arrangement,mode:m.id}}))} />)}</div>
      </Section>
      {state.arrangement.mode==='reinstrument' && <Section title="Reinstrumented Hook">
        <p className="text-xs text-neutral-400 mb-4">단일 Hook 구간을 여러 번 반복하며 악기를 점진적으로 추가/교체하는 구조입니다. 짧은 Hook을 반복하면서 미묘한 진화감을 강조할 때 효과적입니다.</p>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <label className="block mb-2 text-sm opacity-80">Hook Bars</label>
            <div className="flex gap-2 flex-wrap">{[2,4,8].map(b=> <Chip key={b} label={`${b} bars`} active={state.arrangement.reinstrument.hookBars===b} onClick={()=> setHookBars(b as 2|4|8)} />)}</div>
          </div>
            <div>
              <label className="block mb-2 text-sm opacity-80">Variation Curve</label>
              <div className="flex gap-2 flex-wrap">{VARIATION_CURVES.map(v=> <Chip key={v.id} label={v.label} active={state.arrangement.reinstrument.curve===v.id} onClick={()=> setState(s=> ({...s,arrangement:{...s.arrangement,reinstrument:{...s.arrangement.reinstrument,curve:v.id}}}))} />)}</div>
            </div>
            <div>
              <label className="block mb-2 text-sm opacity-80">Preset</label>
              <div className="flex gap-2 flex-wrap">{Object.keys(REINS_PRESETS).map(k=> <Chip key={k} label={k} active={state.arrangement.reinstrument.preset===k} onClick={()=> setState(s=> ({...s,arrangement:{...s.arrangement,reinstrument:{...s.arrangement.reinstrument,preset:k as any}}}))} />)}</div>
            </div>
        </div>
        <div className="mt-3 text-xs opacity-70">Hook 반복 수는 목표 길이에 따라 자동 계산됩니다.</div>
        <div className="mt-1 text-lg font-semibold">Repeats: {state.arrangement.reinstrument.repeats}</div>
      </Section>}
      {state.arrangement.mode==='vc' && <Section title="Verse / Chorus">
        <p className="text-xs text-neutral-400 mb-4">Verse(도입/서술)와 Chorus(후렴/핵심 후킹)가 교차 반복되는 가장 보편적인 구조입니다. Bridge를 추가해 대비감을 줄 수 있습니다.</p>
        <div className="grid md:grid-cols-4 gap-6">
          <div>
            <label className="block text-xs opacity-70 mb-1">Verse Bars</label>
            <input type="number" min={4} max={32} value={state.arrangement.vc.verseBars} onChange={e=> updateVC({verseBars: Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Chorus Bars</label>
            <input type="number" min={4} max={32} value={state.arrangement.vc.chorusBars} onChange={e=> updateVC({chorusBars: Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Cycles</label>
            <input type="number" min={2} max={10} value={state.arrangement.vc.cycles} onChange={e=> updateVC({cycles: Number(e.target.value)||4})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" />
          </div>
          <div className="space-y-2">
            <label className="block text-xs opacity-70">Bridge</label>
            <div className="flex gap-2 items-center">
              <input type="checkbox" checked={state.arrangement.vc.addBridge} onChange={e=> updateVC({addBridge: e.target.checked})} />
              <span className="text-xs">사용</span>
            </div>
            {state.arrangement.vc.addBridge && <input type="number" min={4} max={32} value={state.arrangement.vc.bridgeBars} onChange={e=> updateVC({bridgeBars: Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" />}
          </div>
        </div>
        <div className="mt-3 text-xs text-neutral-400">총 Bars: {vcTotalBars(state.arrangement.vc)}</div>
      </Section>}
      {state.arrangement.mode==='aaba' && <Section title="AABA">
        <p className="text-xs text-neutral-400 mb-4">고전적인 A-A-B-A 포맷. A는 주제(Theme), B는 대비(Bridge/Release) 섹션입니다. cycles를 늘리면 블록 자체를 반복합니다.</p>
        <div className="grid md:grid-cols-3 gap-6">
          <div><label className="block text-xs opacity-70 mb-1">A Bars</label><input type="number" min={4} max={32} value={state.arrangement.aaba.aBars} onChange={e=> updateAABA({aBars:Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">B Bars</label><input type="number" min={4} max={32} value={state.arrangement.aaba.bBars} onChange={e=> updateAABA({bBars:Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">Cycles</label><input type="number" min={1} max={6} value={state.arrangement.aaba.cycles} onChange={e=> updateAABA({cycles:Number(e.target.value)||1})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
        </div>
        <div className="mt-3 text-xs text-neutral-400">총 Bars: {aabaTotalBars(state.arrangement.aaba)}</div>
      </Section>}
      {state.arrangement.mode==='build' && <Section title="Build & Drop">
        <p className="text-xs text-neutral-400 mb-4">점진적으로 에너지를 쌓아 올린 뒤(Dynamic Build) 강한 Drop을 만들고, Post 섹션에서 여운/변형 혹은 절반 에너지로 마무리하는 구조입니다.</p>
        <div className="grid md:grid-cols-5 gap-4">
          <div><label className="block text-xs opacity-70 mb-1">Intro</label><input type="number" min={2} max={32} value={state.arrangement.build.introBars} onChange={e=> updateBuild({introBars:Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">Build</label><input type="number" min={4} max={64} value={state.arrangement.build.buildBars} onChange={e=> updateBuild({buildBars:Number(e.target.value)||16})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">Drop</label><input type="number" min={4} max={64} value={state.arrangement.build.dropBars} onChange={e=> updateBuild({dropBars:Number(e.target.value)||16})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">Post</label><input type="number" min={2} max={32} value={state.arrangement.build.postBars} onChange={e=> updateBuild({postBars:Number(e.target.value)||8})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
          <div><label className="block text-xs opacity-70 mb-1">Rises</label><input type="number" min={0} max={6} value={state.arrangement.build.rises} onChange={e=> updateBuild({rises:Number(e.target.value)||0})} className="bg-neutral-900 border border-neutral-700 rounded px-2 py-2 w-full text-sm" /></div>
        </div>
        <div className="mt-3 text-xs text-neutral-400">총 Bars: {buildTotalBars(state.arrangement.build)}</div>
      </Section>}
      <div className="flex justify-between"><button className="px-5 py-3 rounded-2xl bg-neutral-800 border border-neutral-700" onClick={()=> setStep(2)}>← 이전</button><button className="px-5 py-3 rounded-2xl bg-indigo-600" onClick={()=> setStep(4)}>다음 →</button></div>
    </div>}
    {step===4 && <div className="space-y-8"><Section title="Mood"><div className="flex flex-wrap gap-3">{MOODS.map(m=> <Chip key={m} label={m} active={state.mood.includes(m)} onClick={()=> setState(s=> ({...s,mood: toggleChip(s.mood,m)}))} />)}</div></Section><Section title="FX"><div className="flex flex-wrap gap-3">{FX.map(f=> <Chip key={f} label={f} active={state.fx.includes(f)} onClick={()=> setState(s=> ({...s,fx: toggleChip(s.fx,f)}))} />)}</div></Section><div className="flex justify-between"><button className="px-5 py-3 rounded-2xl bg-neutral-800 border border-neutral-700" onClick={()=> setStep(3)}>← 이전</button><button className="px-5 py-3 rounded-2xl bg-indigo-600" onClick={()=> setStep(5)}>결과 보기 →</button></div></div>}
    {step===5 && <div className="space-y-6"><div className="grid md:grid-cols-3 gap-6"><div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4"><div className="text-sm opacity-80 mb-1">예상 길이</div><div className="text-2xl font-bold">{toMMSS(predictedSec)}</div><div className="text-xs opacity-60 mt-1">BPM & Hook 반복 기반</div></div><div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4"><div className="text-sm opacity-80 mb-1">Readable</div><div className="text-sm whitespace-pre-wrap break-words">{readable}</div><div className={`mt-2 text-xs ${readable.length>200?'text-red-400':'text-emerald-400'}`}>{readable.length} / 200</div><button className="mt-3 px-4 py-2 rounded-xl bg-neutral-800 border border-neutral-700" onClick={()=> copy(readable)}>복사</button></div><div className="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-4"><div className="text-sm opacity-80 mb-1">Compressed</div><div className="text-sm whitespace-pre-wrap break-words">{compressed}</div><div className={`mt-2 text-xs ${compressed.length>200?'text-red-400':'text-emerald-400'}`}>{compressed.length} / 200</div><button className="mt-3 px-4 py-2 rounded-xl bg-indigo-600" onClick={()=> copy(compressed)}>복사</button></div></div><div className="flex gap-3 flex-wrap"><button className="px-5 py-3 rounded-2xl bg-neutral-800 border border-neutral-700" onClick={()=> setStep(4)}>← 수정</button></div></div>}
  </div></div>;
}

