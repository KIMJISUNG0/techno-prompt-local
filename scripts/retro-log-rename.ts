#!/usr/bin/env tsx
/**
 * retro-log-rename.ts
 * 1) Compute sha1( prompt text ) first 8 chars
 * 2) Append prompt record to memory/records/prompts.jsonl
 * 3) Rename existing loose audio files (with spaces or arbitrary names) to standard prefix:
 *    <ISO>Z__<mode>__<hash>__<bpm>bpm.(mp3|wav)
 * 4) Print Colab snippet.
 *
 * Usage examples (PowerShell):
 *   npm run retro:log-rename -- --bpm 106 --mode long --text "Funk Jazz-funk Neo-soul 106bpm ... spring reverb" --pattern "Can't Get Enough"
 *   npm run retro:log-rename -- --bpm 106 --mode long --text-file prompt.txt --pattern "Can't Get Enough"
 *
 * Required: --bpm, (--text or --text-file). Optional: --mode (short|long), --pattern substring to match old filenames.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, appendFileSync, renameSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

interface Args { bpm:number; mode:'short'|'long'; text:string; pattern?:string }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let bpm = 0; let mode:'short'|'long' = 'long'; let text = ''; let pattern: string|undefined;
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--bpm') bpm = Number(argv[++i]);
    else if(a==='--mode') mode = argv[++i] === 'short' ? 'short' : 'long';
    else if(a==='--text') text = argv[++i];
    else if(a==='--text-file'){ const p=argv[++i]; text = readFileSync(p,'utf8').trim(); }
    else if(a==='--pattern') pattern = argv[++i];
  }
  if(!bpm || !Number.isFinite(bpm)) throw new Error('Missing/invalid --bpm');
  if(!text) throw new Error('Missing --text or --text-file');
  return { bpm, mode, text, pattern };
}

function sha8(s:string){ return createHash('sha1').update(s,'utf8').digest('hex').slice(0,8); }

function main(){
  try {
    const { bpm, mode, text, pattern } = parseArgs();
    const hash = sha8(text);
    const ts = new Date().toISOString();
    const prefix = ts.replace(/[-:]/g,'').replace(/\..+/,'Z')+`__${mode}__${hash}__${bpm}bpm`;
    const recordsDir = join(process.cwd(),'memory','records');
    if(!existsSync(recordsDir)) mkdirSync(recordsDir,{recursive:true});
    const file = join(recordsDir,'prompts.jsonl');
    appendFileSync(file, JSON.stringify({ ts, mode, bpm, hash, length: text.length, text, version:1 })+'\n','utf8');
    console.log('[retro-log] appended hash', hash, 'len', text.length);

    const audioDir = join(process.cwd(),'memory','audio');
    if(!existsSync(audioDir)) {
      console.warn('[retro-log] audio dir missing, skip rename');
    } else if(pattern){
      const entries = readdirSync(audioDir);
      const TARGET_RE = /^\d{8}T\d{6}Z__.*__\d{2,3}bpm\.(mp3|wav)$/i;
      const found = entries.filter(f=> f.toLowerCase().includes(pattern.toLowerCase()) && !TARGET_RE.test(f));
      if(!found.length){
        console.warn('[retro-log] no files matched pattern', pattern);
      } else {
        for(const f of found){
          const ext = f.split('.').pop() || 'wav';
            if(!['mp3','wav'].includes(ext.toLowerCase())) continue;
          const oldPath = join(audioDir,f);
          if(!statSync(oldPath).isFile()) continue;
          const newName = prefix + '.' + ext.toLowerCase();
          const newPath = join(audioDir,newName);
          if(existsSync(newPath)){
            console.warn('[retro-log] target already exists, skipping', newName);
            continue;
          }
          renameSync(oldPath,newPath);
          console.log('[retro-rename] ->', newName);
        }
      }
    }

    console.log('\nColab Snippet (copy):\n');
    console.log(`PROMPT_TEXT = ${JSON.stringify(text)}\nPROMPT_HASH = '${hash}'\nBPM = ${bpm}\nMODE = '${mode}'\n# Expected audio filenames (upload then run analysis):\n# ${prefix}.mp3\n# ${prefix}.wav\n`);
  } catch(e:any){
    console.error('[retro-log] ERROR', e.message);
    process.exit(1);
  }
}

main();
