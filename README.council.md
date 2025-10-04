# Dev Council & Memory System

This document is generated / extended by the Dev Council pipeline.

## Overview
The Dev Council orchestrates multi‑engine planning (Gemini / GPT / Local) through phases: draft → critique → revise → score → merge. Output: final spec, tickets, optional patches.

## SSE Streaming
Open a Server‑Sent Events stream to observe phase progress:

```
curl -N "http://localhost:4000/dev-council/stream?prompt=Add%20feature%20X"
```
Events:
- event: phase  data: {phase:"draft:start"}
- event: phase  data: {phase:"draft:done", msg:"drafts=3"}
- ...
- event: done   data: {ok:true}

## Metrics
AI engine latency and success/failure stats collected in memory.
- Raw: GET /ai-usage?mins=30
- Summary: GET /ai-usage/summary

Summary row fields: engine, phase, count, ok, fail, p50, p95, avgMs.

## Rate Limits
Global default: 60 req/min/IP. Elevated (120/min) for /health and /dev-council/stream.

## Scripts
```
npm run dev:orchestrator:mem
npm run dev:sse:smoke
npm run usage:check
npm run remote:smoke   # ORCH env var required (non-stream)
pwsh scripts/remote-smoke.ps1 -Orch $env:ORCH  # PowerShell full smoke
```

## Next
- Persist metrics to memory layer or external store
- Advanced scoring (complexity cost)
- Streaming partial plan diffs
- Optional: GitHub issue / PR automation, Knowledge Card auto-generation

## Remote Smoke (Render)
Set environment variable with your deployed orchestrator:
```
export ORCH=https://<your>.onrender.com
npm run remote:smoke
```
Or PowerShell:
```
$env:ORCH="https://<your>.onrender.com"
powershell -ExecutionPolicy Bypass -File scripts/remote-smoke.ps1
```
