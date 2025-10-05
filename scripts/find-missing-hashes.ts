#!/usr/bin/env tsx
/// <reference types="node" />
/**
 * find-missing-hashes.ts
 * memory/audio 에 존재하는 표준 prefix 오디오들의 hash 집합과
 * docs/lab/metrics.csv / summary.json 에 반영된 hash 집합을 비교해
 * 아직 분석/커밋되지 않은 누락 hash 목록을 출력.
 */
import fs from 'fs';
import path from 'path';

const AUDIO_DIR = path.resolve('memory','audio');
const METRICS = path.resolve('docs','lab','metrics.csv');
const SUMMARY = path.resolve('docs','lab','summary.json');

const FILE_RE = /(\d{8}T\d{6}Z__[a-z0-9]+__([0-9a-f]{8})__\d{2,3}bpm)(?:__v\d+)?\.(mp3|wav)$/i;

function collectAudioHashes(): Set<string> {
  const set = new Set<string>();
  if(!fs.existsSync(AUDIO_DIR)) return set;
  for(const f of fs.readdirSync(AUDIO_DIR)){
    const m = f.match(FILE_RE); if(m) set.add(m[2].toLowerCase());
  }
  return set;
}
function collectMetricHashes(): Set<string> {
  const set = new Set<string>();
  if(!fs.existsSync(METRICS)) return set;
  const lines = fs.readFileSync(METRICS,'utf8').split(/\n+/);
  for(const line of lines){
    // 간단 CSV 패턴: file,filename,timestamp,short_long,hash,...  또는 변형
    const parts = line.split(',');
    const idx = parts.indexOf('hash');
    if(idx >=0) continue; // 헤더 스킵
    // 해시 컬럼이 4번째(0-based 4) 위치라고 가정하되, 라인 첫 10콤마 영역에서 8hex 찾기
    const m = line.match(/,([0-9a-f]{8}),/i);
    if(m) set.add(m[1].toLowerCase());
  }
  return set;
}
function collectSummaryHashes(): Set<string> {
  const set = new Set<string>();
  if(!fs.existsSync(SUMMARY)) return set;
  const text = fs.readFileSync(SUMMARY,'utf8');
  for(const m of text.matchAll(/"hash"\s*:\s*"([0-9a-f]{8})"/ig)){
    set.add(m[1].toLowerCase());
  }
  return set;
}

function main(){
  const audio = collectAudioHashes();
  const metric = collectMetricHashes();
  const summary = collectSummaryHashes();
  const done = new Set([...metric, ...summary]);
  const missing = [...audio].filter(h=> !done.has(h)).sort();
  const report = {
    audioCount: audio.size,
    analyzedCount: done.size,
    missingCount: missing.length,
    missing
  };
  console.log(JSON.stringify(report,null,2));
  if(missing.length){
    console.log('\n다음 해시는 아직 metrics/summary 반영 없음:');
    console.log(missing.join('\n'));
  } else {
    console.log('\n모든 로컬 prefix 해시가 분석 산출물에 반영되었습니다.');
  }
}

main();
