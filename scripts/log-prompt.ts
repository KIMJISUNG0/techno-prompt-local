#!/usr/bin/env tsx
/**
 * Append a prompt metadata record (one line JSON) to memory/records/prompts.jsonl
 * Usage (PowerShell examples):
 *   npm run prompt:log -- --mode long --bpm 96 --text "Funk Jazz-funk ..."
 *
 * Fields auto-added: timestamp, sha1 (first 8), length
 */
import { createHash } from 'crypto';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface Args { mode: 'short'|'long'; bpm:number; text:string }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let mode: 'short'|'long' = 'short';
  let bpm = 0; let text = '';
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if (a==='--mode') mode = argv[++i] as any;
    else if (a==='--bpm') bpm = Number(argv[++i]);
    else if (a==='--text') text = argv[++i];
    else if (a==='--text-file') { // optional file path
      const p = argv[++i];
      text = require('fs').readFileSync(p,'utf8').trim();
    }
  }
  if (!text) { console.error('Missing --text'); process.exit(1); }
  if (!bpm) { console.error('Missing or invalid --bpm'); process.exit(1); }
  if (mode!=='short' && mode!=='long') { console.error('Invalid --mode'); process.exit(1); }
  return { mode, bpm, text };
}

function sha8(input:string){
  return createHash('sha1').update(input,'utf8').digest('hex').slice(0,8);
}

function main(){
  const { mode, bpm, text } = parseArgs();
  const ts = new Date().toISOString();
  const hash = sha8(text);
  const record = {
    ts,
    mode,
    bpm,
    hash,
    length: text.length,
    text,
    version: 1
  };
  const dir = join(process.cwd(),'memory','records');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir,'prompts.jsonl');
  appendFileSync(file, JSON.stringify(record)+'\n','utf8');
  console.log('[prompt:log] appended', hash, 'len', text.length);
  console.log('Suggested audio filename prefix:', new Date().toISOString().replace(/[-:]/g,'').replace(/\..+/,'Z')+`__${mode}__${hash}__${bpm}bpm`);
}

main();
