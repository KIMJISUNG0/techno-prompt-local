# Lab Quickstart: Prompt → Audio → Colab Analysis

This guide shows the fastest loop using the built-in Wizard + server logging + Colab.

## 1. Generate Prompt
1. Run UI (Vite dev) and open Funk Prompt Wizard.
2. Configure substyles / arrangement / instruments etc.
3. Step 5: Press "서버 기록 + Prefix 확정".
   - This POSTs to `/lab/prompt-log` and appends a line to `memory/records/prompts.jsonl`.
   - A final `filenamePrefix` is locked (timestamp + mode + hash + bpm).
4. Copy:
   - Prompt text (for Suno or other model)
   - File Prefix (e.g. `20251005T034055Z__short__27919505__100bpm`)
   - Colab Snippet (variables + expected filenames)

## 2. Render Audio
1. Use the copied prompt in your music model (Suno etc.).
2. Export both WAV and MP3 if possible for comparison.
3. Rename files exactly:
   - `<prefix>.wav`
   - `<prefix>.mp3`
   Example: `20251005T034055Z__short__27919505__100bpm.wav`

## 3. Upload to Colab
1. Open your analysis Colab notebook.
2. Paste the Colab Snippet into the first cell and run.
3. Upload the audio files into the working directory (or a `/audio` folder depending on your pipeline).
4. Run the analysis cell/pipeline. Ensure it parses the hash from the filename.

## 4. Sync Artifacts Back
1. Colab pipeline writes metrics and charts to `docs/lab/` (clone or push with PAT).
2. Pull locally (`git pull`) to update charts and `metrics.csv`.
3. Compare `PROMPT_HASH` vs. analysis metrics for tempo / loudness drift.

## 5. Iterate
- Adjust BPM or arrangement if tempo error consistently overshoots.
- Add dynamic control tokens if LUFS is far from target.
- Re-run Wizard → log new prompt → repeat.

## File Naming Convention
`<ISO_COMPACT>Z__<mode>__<hash>__<bpm>bpm.<ext>`
- `ISO_COMPACT` = `YYYYMMDDTHHMMSSZ`
- `mode` = `short|long`
- `hash` = SHA1(first 8) of prompt text
- `bpm` = integer BPM you requested

## Server Endpoint
POST `/lab/prompt-log` JSON body:
```
{ "text": "...final prompt...", "bpm": 106, "mode": "short" }
```
Response:
```
{ ok:true, hash, filenamePrefix, record:{...} }
```

## Local Prompt Records
Stored line-delimited JSON: `memory/records/prompts.jsonl`
Fields: `ts, mode, bpm, hash, length, text, version`

## Troubleshooting
- Hash mismatch: Ensure you did not modify the prompt after logging. Re-log to regenerate prefix.
- Missing prompt text in analysis: Confirm your analysis script reads `prompts.jsonl` and matches `hash`.
- Multiple takes for same prompt: Append a suffix AFTER copying (e.g., `_take2`) only if you also reflect that in analysis—otherwise keep original prefix for deterministic join.

## Next Enhancements (Planned)
- tempo_error column + loudness normalization guidance
- Auto UI feedback from last analysis pull
- Batch log & multi-take handling with variant index

Happy grooving! 🎶
