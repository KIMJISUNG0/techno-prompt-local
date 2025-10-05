import type { FastifyInstance } from 'fastify';

export type FunkNLInput = {
  substyles?: string[];              // ex) ["P-Funk","G-Funk"] 최대 2
  bpm?: number;                      // 기본 112
  meter?: "4/4"|"3/4"|"6/8";         // 기본 "4/4"
  key?: string;                      // 선택
  repeats?: number;                  // 기본 8
  hookBars?: number;                 // 기본 2
  instruments?: string[];            // ex) ["bass","wah guitar","clav","horn stabs","rhodes","synth lead"]
  groove?: string;                   // ex) "swung 16th hats, tight backbeat"
  fx?: string[];                     // 최대 2
  mix?: string[];                    // 최대 2
  arrangement?: {                    // 편곡(총 길이 계산용, 선택)
    section: 'intro'|'verse'|'pre'|'hook'|'bridge'|'break'|'outro';
    bars: number;
  }[];
  includeLengthHint?: boolean;       // true면 길이 문구 추가(200자 넘치면 자동 제거)
};

const DEFAULT_INSTR = ["bass","wah guitar","clav","horn stabs","rhodes","synth lead"];

function beatsPerBar(meter: FunkNLInput["meter"]|undefined){
  const m = meter ?? "4/4";
  if (m === "6/8") return 6;
  if (m === "3/4") return 3;
  return 4; // "4/4" 기본
}

function toMinSec(totalSec:number){
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s/60);
  const sec = String(s%60).padStart(2,'0');
  return `${m}:${sec}`;
}

function calcSeconds(bpm:number, meter:FunkNLInput["meter"]|undefined, arr?: FunkNLInput["arrangement"]){
  if (!arr || !arr.length) return 0;
  const bpb = beatsPerBar(meter);
  const totalBeats = arr.reduce((sum,a)=> sum + (a.bars>0 ? a.bars*bpb : 0), 0);
  // 한 박 길이(초) = 60 / bpm
  return totalBeats * (60 / Math.max(1, bpm));
}

function sentence(s?:string){
  if (!s) return "";
  const t = s.trim().replace(/\s+/g,' ');
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function list(items:string[]){
  return items.join(', ');
}

function joinParts(parts:string[]){
  return parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}

export interface FunkNaturalResult {
  text: string;
  length: number;
  debug?: {
    originalInstrumentList: string[];
    finalInstrumentList: string[];
    removedSentences: string[];
    truncated: boolean; // true if hard-cut at 200 chars
    stages: { label: string; length: number }[];
    diversity: number; // uniqueWords/totalWords (0~1)
    originalLength: number; // 길이 압축 전 최초 길이
    compressionRatio: number; // finalLength / originalLength (0~1)
    warnings: string[]; // 품질 경고 (ex: low_diversity, truncated)
    originalText: string; // 최초 조립 텍스트
  };
}

function diversityScore(text: string): number {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 0;
  const uniq = new Set(words);
  return +(uniq.size / words.length).toFixed(3);
}

export function buildFunkNaturalPrompt(input: FunkNLInput & { debug?: boolean }): FunkNaturalResult {
  const sub = (input.substyles ?? []).filter(Boolean).slice(0,2);
  const stylePrefix = sub.length
    ? `${sub.join(' and ')} `
    : '';
  const bpm = input.bpm ?? 112;
  const meter = input.meter ?? "4/4";
  const key = input.key ? `, ${input.key}` : '';

  const head = sentence(`Funk ${stylePrefix}instrumental, ${bpm} BPM, ${meter}${key}`);

  const repeats = input.repeats ?? 8;
  const hookBars = input.hookBars ?? 2;

  const baseInstr = (input.instruments && input.instruments.length ? input.instruments : DEFAULT_INSTR).slice(0,6);
  let evolve = sentence(`One ${hookBars}-bar hook repeats ${repeats} times; instruments evolve: ${list(baseInstr)}`);

  const groove = sentence(input.groove);
  const fxList = (input.fx ?? []).filter(Boolean).slice(0,2);
  let fxSent = fxList.length ? sentence(list(fxList)) : "";

  const mixList = (input.mix ?? []).filter(Boolean).slice(0,2);
  let mixSent = mixList.length ? sentence(list(mixList)) : "";

  let lengthSent = "";
  if (input.includeLengthHint && input.arrangement?.length){
    const seconds = calcSeconds(bpm, meter, input.arrangement);
    if (seconds > 0) lengthSent = sentence(`Target length around ${toMinSec(seconds)}`);
  }

  let removed: string[] = [];
  const stages: { label: string; length: number }[] = [];
  let parts = [head, evolve, groove, fxSent, mixSent, lengthSent].filter(Boolean);
  let text = joinParts(parts);
  stages.push({ label: 'initial', length: text.length });
  const originalText = text;
  const originalLength = text.length;

  // 200자 가드: 제거 우선순위 = 길이문구 → 믹스 → FX → 악기 중간 항목 → 마지막 문장
  if (text.length > 200 && lengthSent){
    removed.push(lengthSent);
    parts = parts.filter(p => p !== lengthSent);
    text = joinParts(parts); stages.push({ label: 'drop-length', length: text.length });
  }
  if (text.length > 200 && mixSent){
    removed.push(mixSent);
    parts = parts.filter(p => p !== mixSent);
    text = joinParts(parts); stages.push({ label: 'drop-mix', length: text.length });
  }
  if (text.length > 200 && fxSent){
    removed.push(fxSent);
    parts = parts.filter(p => p !== fxSent);
    text = joinParts(parts); stages.push({ label: 'drop-fx', length: text.length });
  }
  // 악기 리스트 축소(가운데부터 제거)
  let inst = baseInstr.slice();
  while (text.length > 200 && inst.length > 3){
    inst.splice(Math.floor(inst.length/2), 1);
    evolve = sentence(`One ${hookBars}-bar hook repeats ${repeats} times; instruments evolve: ${list(inst)}`);
    parts = [head, evolve, groove, fxSent, mixSent].filter(Boolean);
    text = joinParts(parts); stages.push({ label: 'shrink-instruments', length: text.length });
  }
  // 여전히 길면 뒤 문장부터 제거
  while (text.length > 200 && parts.length > 2){
    const popped = parts.pop();
    if (popped) removed.push(popped);
    text = joinParts(parts); stages.push({ label: 'pop-tail', length: text.length });
  }
  // 최후의 보루: 단어 경계로 자르기
  let truncated = false;
  if (text.length > 200){
    text = text.slice(0,200).replace(/\s+\S*$/,'').replace(/[;,]$/,'').trim();
    if (!/[.!?]$/.test(text)) text += '.';
    truncated = true; stages.push({ label: 'hard-truncate', length: text.length });
  }
  const result: FunkNaturalResult = { text, length: text.length };
  if (input.debug) {
    const warnings: string[] = [];
    if (truncated) warnings.push('truncated');
    const diversity = diversityScore(text);
    if (diversity < 0.75) warnings.push('low_diversity');
    const compressionRatio = +(text.length / (originalLength || text.length)).toFixed(3);
    result.debug = {
      originalInstrumentList: baseInstr,
      finalInstrumentList: inst,
      removedSentences: removed,
      truncated,
      stages,
      diversity,
      originalLength,
      compressionRatio,
      warnings,
      originalText,
    };
  }
  return result;
}

export function funkNaturalPresets(): string[] {
  return [
    "Vintage funk-soul instrumental, 100 BPM, 4/4. One 2-bar hook repeats eight times; instruments evolve: bass, wah guitar, clav, horn stabs, rhodes, synth lead. Tight backbeat, light tape.",
    "P-funk instrumental, 106 BPM, 4/4. One hook repeats; layers grow: sub bass, clav, wah guitar, brass hits, talkbox lead. Greasy groove with swung 16ths. Tape saturation, punchy mix.",
    "Disco-funk instrumental, 120 BPM, 4/4. One hook repeats; build: bass, guitar chucks, strings, brass, bright synth lead. Four-on-the-floor kick, tight hats. Glossy mix.",
    "Jazz-funk instrumental, 108 BPM, 4/4. One hook repeats; instruments evolve: finger bass, rhodes comp, clean guitar, soft brass, synth lead. Syncopated drums, room reverb.",
    "Modern funk instrumental, 114 BPM, 4/4. One 2-bar hook repeats; cycle: synth bass, clav, horn stabs, supersaw lead. Snappy drums with swung 16ths, punchy and clear."
  ].map(s => s.length>200 ? s.slice(0,200) : s);
}
