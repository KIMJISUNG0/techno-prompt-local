#!/usr/bin/env tsx
/**
 * prepare-audio-from-exports.ts
 * 목적: 크롬 다운로드 경로를 프로젝트 내부 memory/audio 로 직접 지정한 환경에서
 * 새로 떨어진 mp3/wav 파일을 가장 최근 prompts export JSONL 내용(또는 prompts.jsonl) 기반 prefix로
 * 표준화(rename) + 대응 프롬프트 .prompt.txt 생성.
 *
 * 사용 시나리오:
 *  1) Wizard 에서 최종 프롬프트 로컬 기록 + Export(.jsonl) → memory/audio 폴더(또는 exports/)에 동일 prefix 포함
 *  2) Suno 등에서 오디오 생성 → 브라우저 기본 다운로드 폴더를 memory/audio 로 변경 (크롬 설정)
 *  3) 이 스크립트 실행: 최근 mp3/wav (기본 N=4) 스캔 → 아직 표준 규칙( ____hash__bpm ) 아닌 임시 파일을 감지 → 가장 가까운 최신 프롬프트 레코드와 매칭 → rename
 *  4) .prompt.txt 동반 생성.
 *
 * 매칭 로직:
 *  - prompts.jsonl (memory/records) 가장 마지막 라인을 우선 사용
 *  - 또는 --hash 지정 시 해당 hash 레코드 사용
 *  - prefix = ts__mode__hash__<bpm>bpm  (ts: 레코드 ts ISO 를 압축, fallback: 현재 UTC)
 *  - 이미 동일 prefix.mp3 존재하면 _dup1 증가 suffix
 *
 * 제한:
 *  - 해시 직접 지정 안 하면 최근 한 개 프롬프트만 대상
 *  - 다중 파일을 하나 해시에 묶을 경우 mp3/wav 쌍만 처리 (기본)
 */
import fs from 'fs';
import path from 'path';

interface PromptLine { hash:string; ts?:string; bpm?:number; mode?:string; text?:string; filenamePrefix?:string }

const AUDIO_DIR = process.env.AUDIO_DIR || path.resolve('memory','audio');
const PROMPTS_FILE = path.resolve('memory','records','prompts.jsonl');
const LIMIT_RECENT = Number(process.env.AUDIO_RECENT_SCAN || '6');
const ARG_HASH = process.argv.find(a=> a.startsWith('--hash='))?.split('=')[1];
const DRY = process.argv.includes('--dry');

function isoToCompressed(iso?:string){
  if(!iso) return new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'Z');
  return iso.replace(/[-:]/g,'').replace(/\..+/,'Z');
}

function readLastPrompt(): PromptLine | null {
  if(!fs.existsSync(PROMPTS_FILE)) return null;
  const lines = fs.readFileSync(PROMPTS_FILE,'utf8').trim().split(/\n+/); if(!lines.length) return null;
  let candidate: PromptLine | null = null;
  for(let i=lines.length-1; i>=0; i--){
    try { const j = JSON.parse(lines[i]); if(!j.hash) continue; candidate = j; if(!ARG_HASH) break; if(j.hash===ARG_HASH) break; } catch {}
  }
  if(ARG_HASH && candidate?.hash !== ARG_HASH){
    console.error('[prepare] 지정한 해시를 prompts.jsonl에서 찾지 못했습니다:', ARG_HASH); process.exit(2);
  }
  return candidate;
}

function listRecentAudio(){
  if(!fs.existsSync(AUDIO_DIR)) return [] as string[];
  const all = fs.readdirSync(AUDIO_DIR).filter(f=> /\.(mp3|wav)$/i.test(f));
  const stats = all.map(f=> ({ f, t: fs.statSync(path.join(AUDIO_DIR,f)).mtimeMs }))
    .sort((a,b)=> b.t - a.t)
    .slice(0,LIMIT_RECENT)
    .map(o=> o.f);
  return stats;
}

function isStandardName(name:string){
  // 예: 20251005T103312Z__short__abcd1234__106bpm.mp3
  return /__([a-z0-9]{8})__\d{2,3}bpm\.(mp3|wav)$/i.test(name);
}

function ensureDir(p:string){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }

function writePromptTxt(prefix:string, prompt: PromptLine){
  const meta = [
    `HASH=${prompt.hash}`,
    prompt.mode? `MODE=${prompt.mode}`: null,
    prompt.bpm? `BPM=${prompt.bpm}`: null,
    `PREFIX=${prefix}`
  ].filter(Boolean).join('\n');
  const body = (prompt.text||'').trim();
  fs.writeFileSync(path.join(AUDIO_DIR, prefix + '.prompt.txt'), meta + '\n\n' + body, 'utf8');
}

function main(){
  ensureDir(AUDIO_DIR);
  const prompt = readLastPrompt();
  if(!prompt){ console.error('[prepare] 최근 프롬프트 레코드 없음 (prompts.jsonl 먼저 갱신)'); process.exit(1);} 
  const hash = prompt.hash;
  const bpm = prompt.bpm || 0;
  const mode = prompt.mode || 'short';
  // prefix 우선순위: 기록된 filenamePrefix → 구성 → 재구성
  let prefix = prompt.filenamePrefix;
  if(!prefix){ prefix = `${isoToCompressed(prompt.ts)}__${mode}__${hash}__${bpm||0}bpm`; }

  const recent = listRecentAudio();
  const targets = recent.filter(f=> !isStandardName(f));
  if(!targets.length){ console.log('[prepare] 표준화 필요한 최근 파일 없음'); return; }

  console.log('[prepare] 대상 (최신)', targets);
  // mp3/wav 한 쌍만 우선 (여러 개면 최초 2개)
  const picked = targets.slice(0,2);
  let idx = 0;
  for(const name of picked){
    const ext = path.extname(name).toLowerCase();
    const src = path.join(AUDIO_DIR,name);
    let destBase = prefix + (picked.length>1? `__v${idx+1}`: '') + ext; // 여러 개면 v1/v2 유지
    // 충돌 방지
    let attempt = 1;
    while(fs.existsSync(path.join(AUDIO_DIR,destBase))){
      destBase = prefix + (picked.length>1? `__v${idx+1}`: '') + `_dup${attempt}` + ext;
      attempt++;
    }
    if(DRY){
      console.log('[dry] rename', name, '->', destBase);
    } else {
      fs.renameSync(src, path.join(AUDIO_DIR,destBase));
      console.log('✔ rename', name, '->', destBase);
    }
    idx++;
  }
  if(!DRY) writePromptTxt(prefix, prompt);
  console.log('[prepare] 완료. prefix:', prefix);
}

main();
