#!/usr/bin/env tsx
/**
 * 비표준(우리 규격: YYYYMMDDTHHMMSSZ__mode__hash__XXXbpm.ext) 오디오 파일을 스캔하여
 * (1) 기존 summary.json / metrics.csv / next_prompts.json 과 매칭되는 hash 유추
 * (2) prompts.jsonl 에 없는 hash 경고
 * (3) 파일명에서 bpm 미검출 시 분석 파일(bpm_parsed, tempo_librosa) 사용
 * (4) 표준 리네이밍 제안 출력
 *
 * 사용: npm run audio:auto-detect (package.json script 추가 필요)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface PromptRecord { ts:string; mode:'short'|'long'; bpm:number; hash:string; length:number; text:string; version:number }
interface SummaryEntry { file:string; hash:string; short_long?:string; bpm_parsed?:number|null; tempo_librosa?:number|null; lufs?:number|null; spectral_centroid?:number|null; prompt_text?:string|null }
interface PatchEntry { hash:string; patch:string; prompt_text?:string; bpm?:number }

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT,'memory','audio');
const RECORDS_FILE = path.join(ROOT,'memory','records','prompts.jsonl');
const SUMMARY_FILE = path.join(ROOT,'docs','lab','summary.json');
const METRICS_FILE = path.join(ROOT,'docs','lab','metrics.csv');
const NEXT_FILE = path.join(ROOT,'docs','lab','next_prompts.json');

function loadPrompts():Map<string,PromptRecord>{
  const map = new Map<string,PromptRecord>();
  if(!fs.existsSync(RECORDS_FILE)) return map;
  const lines = fs.readFileSync(RECORDS_FILE,'utf8').split(/\r?\n/).filter(Boolean);
  for(const ln of lines){
    try { const obj = JSON.parse(ln) as PromptRecord; map.set(obj.hash,obj); } catch {}
  }
  return map;
}
function loadSummary():SummaryEntry[]{
  if(!fs.existsSync(SUMMARY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SUMMARY_FILE,'utf8')); } catch { return []; }
}
function loadNext():PatchEntry[]{
  if(!fs.existsSync(NEXT_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(NEXT_FILE,'utf8')); } catch { return []; }
}
function parseMetricsCsv():Record<string,any>{
  if(!fs.existsSync(METRICS_FILE)) return {};
  const rows = fs.readFileSync(METRICS_FILE,'utf8').split(/\r?\n/).filter(l=>l.trim());
  const header = rows.shift(); if(!header) return {};
  const cols = header.split(',');
  const map: Record<string,any> = {};
  for(const r of rows){
    const parts = r.split(',');
    if(parts.length !== cols.length) continue;
    const obj: any = {}; cols.forEach((c,i)=> obj[c]=parts[i]);
    const hash = obj['hash'];
    if(hash) map[hash] = obj;
  }
  return map;
}

const PROMPT_HASH_RE = /__([a-f0-9]{8})__/i;
const STANDARD_PREFIX_RE = /^(\d{8}T\d{6}Z)__(short|long)__([a-f0-9]{8})__(\d{2,3})bpm$/i;

function detectHashFromArbitraryFilename(name:string):string|undefined{
  // 1) 표준 패턴 → 바로 추출
  const base = name.replace(/\.(wav|mp3|flac|aiff|aif|ogg|m4a)$/i,'');
  const std = base.match(STANDARD_PREFIX_RE);
  if(std) return std[3].toLowerCase();
  // 2) 임베디드 __hash__ 패턴
  const emb = base.match(PROMPT_HASH_RE);
  if(emb) return emb[1].toLowerCase();
  // 3) metrics/summary에 등장하는 hash 후보 비교: 파일명 일부가 레코드 파일명과 일치하는 경우
  return undefined;
}

function suggestIsoTimestamp():string{
  return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'Z');
}

function main(){
  console.log('[auto-detect] 시작');
  const argv = process.argv.slice(2);
  const APPLY = argv.includes('--apply');
  if(APPLY) console.log('[auto-detect] --apply 모드: 제안된 rename 수행 (prompt 미존재 hash는 로그 append 생략)');
  const promptMap = loadPrompts();
  const summary = loadSummary();
  const patches = loadNext();
  const metricsMap = parseMetricsCsv();
  const summaryByHash = new Map(summary.map(s=> [s.hash, s] as const));
  const patchByHash = new Map(patches.map(p=> [p.hash, p] as const));

  if(!fs.existsSync(AUDIO_DIR)){
    console.log('[auto-detect] audio 디렉토리 없음:', AUDIO_DIR);
    process.exit(0);
  }
  const files = fs.readdirSync(AUDIO_DIR).filter(f=> /\.(wav|mp3|flac|aiff|aif|ogg|m4a)$/i.test(f));
  if(!files.length){ console.log('[auto-detect] 오디오 파일 없음'); return; }

  const report: any[] = [];
  for(const f of files){
    const full = path.join(AUDIO_DIR,f);
    const hash = detectHashFromArbitraryFilename(f);
    let status: string[] = [];
    let resolvedHash = hash;
    let promptRec: PromptRecord | undefined;
    let summaryRec: SummaryEntry | undefined;
    if(hash){
      if(promptMap.has(hash)){
        promptRec = promptMap.get(hash);
        status.push('prompt_log:FOUND');
      } else {
        status.push('prompt_log:MISSING');
      }
      if(summaryByHash.has(hash)){
        summaryRec = summaryByHash.get(hash);
        status.push('summary:FOUND');
      } else {
        status.push('summary:MISS');
      }
    } else {
      status.push('hash:UNDETECTED');
      // 추가 전략: summary.json 내 file 경로가 원래 이름과 유사한 것 찾기
      const guess = summary.find(s=> path.basename(s.file||'').toLowerCase() === f.toLowerCase());
      if(guess){
        resolvedHash = guess.hash;
        summaryRec = guess;
        status.push('summary:nameMatch');
        if(promptMap.has(guess.hash)) status.push('prompt_log:FOUND'); else status.push('prompt_log:MISSING');
      }
    }
    // bpm 결정
    let bpm: number | null = null;
    if(resolvedHash){
      const metricsRow = metricsMap[resolvedHash];
      if(metricsRow){
        const tempoLib = parseFloat(metricsRow['tempo_librosa']);
        if(!isNaN(tempoLib)) bpm = Math.round(tempoLib);
      }
    }
    // 모드 추정: summary.short_long or promptRec.mode 없으면 default 'short'
    let mode: 'short'|'long' = 'short';
    if(promptRec) mode = promptRec.mode;
    else if(summaryRec && (summaryRec.short_long==='long' || summaryRec.short_long==='short')) mode = summaryRec.short_long as any;

    // 표준 파일명 제안
    let suggestName: string | null = null;
    if(resolvedHash){
      const iso = suggestIsoTimestamp();
      const finalBpm = bpm || 0;
      suggestName = `${iso}__${mode}__${resolvedHash}__${finalBpm||'???'}bpm${path.extname(f).toLowerCase()}`;
    }
    const patchRec = resolvedHash ? patchByHash.get(resolvedHash) : undefined;

    report.push({ file:f, full, resolvedHash, status: status.join('|'), bpmSuggested: bpm, mode, suggestName, patch: patchRec?.patch || null, promptKnown: !!promptRec, promptLength: promptRec?.length||null, renamed:false });
  }

  // APPLY 단계: 실 rename 수행
  if(APPLY){
    for(const r of report){
      if(!r.resolvedHash) continue; // hash 없음
      if(!r.suggestName) continue; // 제안 없음
      const currentBase = r.file.replace(/\.(wav|mp3|flac|aiff|aif|ogg|m4a)$/i,'');
      // 이미 표준이면 skip
      if(STANDARD_PREFIX_RE.test(currentBase)) continue;
      const target = path.join(AUDIO_DIR, r.suggestName);
      if(fs.existsSync(target)){
        console.log('[apply] 대상 이름 이미 존재, skip:', target);
        continue;
      }
      try {
        fs.renameSync(r.full, target);
        r.renamed = true;
        r.status += '|RENAMED';
        console.log('[apply] rename OK:', r.file, '->', r.suggestName);
      } catch(e:any){
        r.status += '|RENAME_FAIL';
        console.log('[apply] rename 실패:', r.file, e.message);
      }
    }
  }

  // 출력 테이블 (최종)
  console.log('\n[auto-detect] 결과');
  console.table(report.map(r=> ({ file:r.file, hash:r.resolvedHash||'', status:r.status, bpm:r.bpmSuggested||'', mode:r.mode, rename:r.suggestName||'', renamed: r.renamed? 'Y':'', prompt:r.promptKnown?'Y':'', patch: (r.patch? r.patch.slice(0,40)+'…': '') })));

  // JSON 저장 (선택 활용)
  const outFile = path.join(ROOT,'docs','lab','auto_detect_report.json');
  fs.writeFileSync(outFile, JSON.stringify(report,null,2),'utf8');
  console.log('\n[auto-detect] 상세 JSON:', outFile);
  if(APPLY){
    console.log('[auto-detect] NOTE: prompt_log:MISSING 해시는 원문 프롬프트 불명 → retro logging 생략 (수동 복원 필요)');
  }
  console.log('[auto-detect] 끝');
}

main();
