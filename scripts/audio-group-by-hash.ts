#!/usr/bin/env tsx
/**
 * 해시 기준(표준 파일명 규칙)으로 audio 디렉토리 내 다중 포맷(mp3/wav 등) 그룹화 리포트.
 * 규격: YYYYMMDDTHHMMSSZ__mode__hash__BPMbpm.ext
 * 기능:
 *  1) 동일 hash 여러 포맷 존재 여부 표시
 *  2) canonical(우선순위: wav > aiff > flac > mp3 > ogg > m4a) 선정
 *  3) prompts.jsonl 존재 여부 + orphan 여부
 *  4) summary.json/metrics.csv 등장 여부
 *  5) JSON 리포트 저장 docs/lab/audio_groups.json
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const AUDIO_DIR = path.join(ROOT,'memory','audio');
const PROMPTS = path.join(ROOT,'memory','records','prompts.jsonl');
const SUMMARY = path.join(ROOT,'docs','lab','summary.json');
const METRICS = path.join(ROOT,'docs','lab','metrics.csv');

const STD_RE = /^(\d{8}T\d{6}Z)__(short|long)__([a-f0-9]{8})__(\d{2,3})bpm\.(wav|aiff|aif|flac|mp3|ogg|m4a)$/i;
const EXT_PRIORITY = ['wav','aiff','aif','flac','mp3','ogg','m4a'];

interface PromptRec{ hash:string; mode:string; bpm:number; text:string; }

function loadPromptHashes():Set<string>{
  const set = new Set<string>();
  if(!fs.existsSync(PROMPTS)) return set;
  for(const ln of fs.readFileSync(PROMPTS,'utf8').split(/\r?\n/)){
    if(!ln.trim()) continue; try { const j = JSON.parse(ln); if(j.hash) set.add(j.hash); } catch {}
  }
  return set;
}
function loadSummaryHashes():Set<string>{
  const set = new Set<string>();
  if(!fs.existsSync(SUMMARY)) return set; try { const arr = JSON.parse(fs.readFileSync(SUMMARY,'utf8')); for(const r of arr) if(r.hash) set.add(r.hash); } catch {}
  return set;
}
function loadMetricsHashes():Set<string>{
  const set = new Set<string>();
  if(!fs.existsSync(METRICS)) return set;
  const lines = fs.readFileSync(METRICS,'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines.shift(); if(!header) return set;
  const cols = header.split(','); const idx = cols.indexOf('hash'); if(idx===-1) return set;
  for(const l of lines){ const p = l.split(','); if(p[idx]) set.add(p[idx]); }
  return set;
}

function main(){
  if(!fs.existsSync(AUDIO_DIR)) { console.log('[group] audio dir 없음'); return; }
  const promptHashes = loadPromptHashes();
  const summaryHashes = loadSummaryHashes();
  const metricsHashes = loadMetricsHashes();

  const files = fs.readdirSync(AUDIO_DIR).filter(f=> STD_RE.test(f));
  const groups: Record<string, any> = {};
  for(const f of files){
    const m = f.match(STD_RE)!; // test에서 이미 true
    const iso = m[1]; const mode = m[2]; const hash = m[3].toLowerCase(); const bpm = Number(m[4]); const ext = m[5].toLowerCase();
    if(!groups[hash]) groups[hash] = { hash, variants: [], modeGuess: mode, bpmGuess: bpm };
    groups[hash].variants.push({ file:f, ext, iso, bpm });
  }
  const out = Object.values(groups).map((g: any)=>{
    g.variants.sort((a:any,b:any)=> EXT_PRIORITY.indexOf(a.ext)-EXT_PRIORITY.indexOf(b.ext));
    g.canonical = g.variants[0];
    g.promptLogged = promptHashes.has(g.hash);
    g.inSummary = summaryHashes.has(g.hash);
    g.inMetrics = metricsHashes.has(g.hash);
    g.orphan = !g.promptLogged && (g.inSummary || g.inMetrics);
    return g;
  });

  out.sort((a:any,b:any)=> a.hash.localeCompare(b.hash));
  console.table(out.map((g:any)=> ({ hash:g.hash, files:g.variants.length, canonical:g.canonical.file, prompt:g.promptLogged?'Y':'', summary:g.inSummary?'Y':'', metrics:g.inMetrics?'Y':'', orphan:g.orphan?'Y':'', mode:g.modeGuess, bpm:g.bpmGuess }))); 
  const dest = path.join(ROOT,'docs','lab','audio_groups.json');
  fs.writeFileSync(dest, JSON.stringify(out,null,2),'utf8');
  console.log('\n[group] 저장:', dest);
  const orphanCount = out.filter((g:any)=> g.orphan).length;
  console.log(`[group] Orphan hash 그룹: ${orphanCount}`);
}

main();
