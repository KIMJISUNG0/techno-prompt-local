#!/usr/bin/env tsx
/**
 * Lightweight audio metadata + feature extraction (placeholder without heavy DSP libs).
 * For full spectral features you would run the Python pipeline in Colab.
 * This script focuses on mapping existing audio filenames to prompt hashes and durations using ffprobe if available.
 */
import { execSync } from 'child_process';
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const AUDIO_DIR = join(process.cwd(), 'memory', 'audio');
const PROMPTS_PATH = join(process.cwd(), 'memory', 'records', 'prompts.jsonl');
const OUT_DIR = join(process.cwd(), 'analysis');
const METRICS_CSV = join(OUT_DIR, 'metrics.csv');
const SUMMARY_JSON = join(OUT_DIR, 'metrics_summary.json');

interface PromptRec { hash:string; mode:string; bpm:number; text:string; length:number; ts?:string }
interface Row { hash:string; mode:string; bpm:number; filename:string; size_bytes:number; duration_sec?:number; text?:string }

function parsePrompts(): Record<string,PromptRec> {
  if(!existsSync(PROMPTS_PATH)) return {};
  const map: Record<string,PromptRec> = {};
  const lines = readFileSync(PROMPTS_PATH,'utf8').split(/\r?\n/).filter(Boolean);
  for(const line of lines){
    try { const obj = JSON.parse(line); if(obj.hash) map[obj.hash] = obj; } catch {}
  }
  return map;
}

const AUDIO_RE = /^(\d{8}T\d{6}Z)__(short|long)__([0-9a-f]{6,10})__(\d+)bpm\.(wav|mp3)$/i;

function ffprobeDuration(path:string): number|undefined {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path}"`;
    const out = execSync(cmd,{stdio:['ignore','pipe','ignore']}).toString().trim();
    const v = parseFloat(out); return isFinite(v)? v : undefined;
  } catch { return undefined; }
}

function main(){
  const promptMap = parsePrompts();
  if(!existsSync(AUDIO_DIR)){
    console.error('No audio dir:', AUDIO_DIR); process.exit(1);
  }
  const rows: Row[] = [];
  for(const f of readdirSync(AUDIO_DIR)){
    if(f==='README.md') continue;
    const m = AUDIO_RE.exec(f); if(!m) continue;
    const [,ts,mode,hash,bpmStr] = m; // ext not needed presently
    const full = join(AUDIO_DIR,f);
    const st = statSync(full);
    const dur = ffprobeDuration(full);
    const prompt = promptMap[hash];
    rows.push({ hash, mode, bpm:+bpmStr, filename:f, size_bytes: st.size, duration_sec: dur, text: prompt?.text });
  }
  if(!rows.length){
    console.warn('No matching audio files. Ensure naming convention is applied.');
  }
  if(!existsSync(OUT_DIR)) mkdirSync(OUT_DIR,{recursive:true});
  // Write CSV
  const header = ['hash','mode','bpm','filename','size_bytes','duration_sec','text_char_len'];
  const lines = [header.join(',')];
  for(const r of rows){
    const len = r.text? r.text.length: '';
    lines.push([r.hash,r.mode,r.bpm,r.filename,r.size_bytes,r.duration_sec??'',len].join(','));
  }
  writeFileSync(METRICS_CSV, lines.join('\n'),'utf8');
  const summary = {
    total_files: rows.length,
    modes: Object.fromEntries(Object.entries(rows.reduce((acc:any,r)=>{acc[r.mode]=(acc[r.mode]||0)+1; return acc;},{}))),
    avg_duration: (()=>{const ds=rows.map(r=>r.duration_sec).filter(Boolean) as number[]; return ds.length? +(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(2): null;})(),
    missing_prompts: rows.filter(r=> !r.text).map(r=> r.hash),
    generated_at: new Date().toISOString()
  };
  writeFileSync(SUMMARY_JSON, JSON.stringify(summary,null,2),'utf8');
  console.log('[analyze-audio] wrote', METRICS_CSV, 'and summary JSON');
  console.log(summary);
}

main();