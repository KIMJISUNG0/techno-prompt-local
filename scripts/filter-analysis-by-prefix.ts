#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * filter-analysis-by-prefix.ts
 * 목적: Colab 이 생성해 push 한 분석 결과(metrics.csv, summary.json 등) 중에서
 *      로컬 memory/audio 에 존재하는 표준 prefix 세트(리네이밍된 파일들)와 매칭되는 것만
 *      추출하여 요약 출력 또는 별도 폴더에 저장.
 *
 * 매칭 키 전략 (우선순위):
 *   1) prefix 에서 추출한 hash (예: 20251005T083419Z__long__e272747f__106bpm → e272747f)
 *   2) metrics.csv 의 hash 컬럼
 *   3) summary.json 레코드의 hash 필드
 * (hash 기반이 더 안정. 파일명이 아직 raw 였던 과거 레코드는 제외됨)
 *
 * 사용법:
 *   tsx scripts/filter-analysis-by-prefix.ts               # 최신 prefix 세트 자동 감지
 *   tsx scripts/filter-analysis-by-prefix.ts --prefix=<prefix-base>
 *   tsx scripts/filter-analysis-by-prefix.ts --hash=e272747f
 *   tsx scripts/filter-analysis-by-prefix.ts --out=docs/lab/filtered  --markdown
 *
 * 자동 감지:
 *   memory/audio 안의 파일명에서 정규식 ^(TIMESTAMP__mode__hash__bpm)bpm(__v\d+)?\.mp3|wav
 *   → __vN 제거한 base prefix 들 수집 → 가장 최근 mtime 기반 하나 선택(또는 --all 로 모두)
 *
 * 출력:
 *   - 콘솔에 JSON 요약 (hash, count(metrics rows), lufs/tempo ranges)
 *   - --markdown 지정 시 마크다운 표 형태도 함께 출력
 *   - --write 또는 --out 지정 시 docs/lab/filtered/<prefix>/summary.json, metrics.csv 부분 발췌 저장
 */
import fs from 'fs';
import path from 'path';

const AUDIO_DIR = path.resolve('memory','audio');
const LAB_DIR = path.resolve('docs','lab');
const METRICS_CSV = path.join(LAB_DIR,'metrics.csv');
const SUMMARY_JSON = path.join(LAB_DIR,'summary.json');

interface SummaryRec { file?:string; hash?:string; tempo_librosa?:number; lufs?:number; rms_db?:number; spectral_centroid?:number; }

const arg = (name:string): string | undefined => process.argv.find((a:string)=> a.startsWith(`--${name}=`))?.split('=')[1];
const hasFlag = (f:string): boolean => process.argv.includes(`--${f}`);

const ARG_PREFIX = arg('prefix');
const ARG_HASH = arg('hash');
const ARG_OUT = arg('out');
const FLAG_MARKDOWN = hasFlag('markdown');
const FLAG_ALL = hasFlag('all');
const FLAG_WRITE = hasFlag('write') || Boolean(ARG_OUT);

function listLocalPrefixes(): { base:string; hash:string; mtime:number }[] {
  if(!fs.existsSync(AUDIO_DIR)) return [];
  const re = /^(\d{8}T\d{6}Z__[a-z0-9]+__([a-f0-9]{8})__\d{2,3}bpm)(__v\d+)?\.(mp3|wav)$/i;
  const map = new Map<string,{ hash:string; mtime:number }>();
  for(const f of fs.readdirSync(AUDIO_DIR)){
    const m = f.match(re); if(!m) continue;
    const base = m[1]; const hash = m[2];
    const mt = fs.statSync(path.join(AUDIO_DIR,f)).mtimeMs;
    const prev = map.get(base);
    if(!prev || prev.mtime < mt) map.set(base,{hash,mtime:mt});
  }
  return [...map.entries()].map(([base,v])=> ({base, hash:v.hash, mtime:v.mtime})).sort((a,b)=> b.mtime - a.mtime);
}

function parseMetricsCSV(): { header:string[]; rows:Record<string,string>[] } {
  if(!fs.existsSync(METRICS_CSV)) return {header:[],rows:[]};
  const raw = fs.readFileSync(METRICS_CSV,'utf8').replace(/\r/g,'');
  const lines = raw.split(/\n+/).filter((l:string)=> l.trim());
  if(lines.length===0) return {header:[],rows:[]};
  // 일부 케이스: 헤더와 첫 row 사이 줄바꿈 누락 → 복구 시도
  const first = lines[0];
  const headerParts = first.split(',');
  // 휴리스틱: 만약 headerParts 가 지나치게 길고 hash,tempo,lufs 등의 키 포함되어 있지 않다면 재분할
  // (현재 샘플에선 첫 line 뒤에 데이터 붙어 있음)
  // 간단히 ' file,' 패턴 2회 이상 등장하면 첫 row 접합이라 판단
  const rows: Record<string,string>[] = [];
  let header: string[] = headerParts;
  // 나머지 라인은 전형적 CSV 라고 가정 (콤마 단순 split)
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',');
    if(cols.length < 2) continue;
    // 헤더 길이와 맞추기 (과잉은 버리고 부족은 빈 문자열)
    const row: Record<string,string> = {};
    header.forEach((h,idx)=> { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return {header, rows};
}

function loadSummary(): SummaryRec[] {
  if(!fs.existsSync(SUMMARY_JSON)) return [];
  try { return JSON.parse(fs.readFileSync(SUMMARY_JSON,'utf8')) as SummaryRec[]; } catch { return []; }
}

function ensureDir(p:string){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }

function main(){
  const locals = listLocalPrefixes();
  if(locals.length===0){
    console.error('[filter] 로컬 prefix 규칙 파일이 없습니다 (memory/audio).');
  }
  let targets = locals;
  if(ARG_PREFIX) targets = targets.filter(t=> t.base.startsWith(ARG_PREFIX));
  if(ARG_HASH) targets = targets.filter(t=> t.hash === ARG_HASH);
  if(!FLAG_ALL && targets.length>1) targets = targets.slice(0,1); // 기본: 최신 1개
  if(targets.length===0){
    console.error('[filter] 매칭되는 prefix 선택 결과 없음');
  process.exit(2);
  }
  const targetHashes = new Set(targets.map(t=> t.hash));

  const metrics = parseMetricsCSV();
  const summary = loadSummary();

  const metricsMatched = metrics.rows.filter(r=> targetHashes.has(r['hash']));
  const summaryMatched = summary.filter(r=> r.hash && targetHashes.has(r.hash));

  const hashStats = [...targetHashes].map(h=> {
    const sm = summaryMatched.filter(r=> r.hash===h);
    const tempos = sm.map(r=> r.tempo_librosa).filter(Boolean) as number[];
    const lufs = sm.map(r=> r.lufs).filter(Boolean) as number[];
    const tempoMean = tempos.length? (tempos.reduce((a,b)=>a+b,0)/tempos.length): undefined;
    const lufsMean = lufs.length? (lufs.reduce((a,b)=>a+b,0)/lufs.length): undefined;
    return { hash:h, summaryCount: sm.length, metricsCount: metricsMatched.filter(r=> r.hash===h).length, tempoMean, lufsMean };
  });

  const result = { prefixes: targets, stats: hashStats, metricsMatched, summaryMatched };
  console.log(JSON.stringify(result,null,2));

  if(FLAG_MARKDOWN){
    console.log('\n---\n# Filtered Stats (Markdown)');
    console.log('| hash | prefix | sum_rows | met_rows | tempo_mean | lufs_mean |');
    console.log('|------|--------|----------|----------|-----------:|----------:|');
    for(const s of hashStats){
      const pref = targets.find(p=> p.hash===s.hash)?.base || '';
      console.log(`| ${s.hash} | ${pref} | ${s.summaryCount} | ${s.metricsCount} | ${s.tempoMean?.toFixed(2) ?? ''} | ${s.lufsMean?.toFixed(2) ?? ''} |`);
    }
  }

  if(FLAG_WRITE){
    const outRoot = ARG_OUT || path.join(LAB_DIR,'filtered');
    for(const pref of targets){
      const dir = path.join(outRoot, pref.base);
      ensureDir(dir);
      fs.writeFileSync(path.join(dir,'summary.json'), JSON.stringify(summaryMatched.filter(r=> r.hash===pref.hash), null,2));
      // metrics 부분 발췌
      if(metrics.header.length){
        const lines = [metrics.header.join(',')];
        for(const row of metricsMatched.filter(r=> r.hash===pref.hash)){
          lines.push(metrics.header.map(h=> row[h]??'').join(','));
        }
        fs.writeFileSync(path.join(dir,'metrics.csv'), lines.join('\n'));
      }
    }
    console.log('[filter] Wrote filtered artifacts to', ARG_OUT || path.join(LAB_DIR,'filtered'));
  }
}

main();
