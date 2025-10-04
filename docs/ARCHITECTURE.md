# Architecture Overview

## Goals
- Deterministic taxonomy → UI derived from data only
- Progressive layering for prompt composition
- Low-latency audio pattern engine + optional Tone.js hybrid
-Portable environment: devcontainer + CI reproducibility

## Layers
| Layer | Purpose | Key Modules |
|-------|---------|-------------|
| Data Schema | Source of truth for groups/options/subopts | `src/data/taxonomy.ts` |
| Selection State | Track chosen tokens/patterns | likely in `src/state/*` (future extraction) |
| Composition Flow | Multi-step prompt building | `QuickComposer`, `ProgressiveComposer` |
| Audio Engine | Custom WebAudio + Tone hybrid | `live/*`, future `tone/*` |
| Serialization | Export / Import presets & state | `src/preset/*` |
| Validation | Ensure taxonomy consistency | `scripts/validate-taxonomy.*` |

## Audio Engine (Phase1)
- Lightweight custom scheduling (requestAnimationFrame + setTimeout hybrid) for pattern ticking.
- Simple voices (kick/snare/hat/bass/lead/pad) synthesized via oscillators & noise.
- FX chain (delay, reverb, compressor) shared; per-voice parameter knobs.

## Future Extraction
- `useAutoDarkMode` → `src/hooks/useAutoDarkMode.ts`
- State reducers → `src/state/composer.ts`
- Audio scheduling → `src/audio/scheduler.ts`

## Queue & Orchestration (MVP)
Component | Responsibility | Fallback
--------- | -------------- | --------
Orchestrator (`orchestrator/index.ts`) | Accept tasks (`/enqueue`), expose stats/results | In-memory queue when `ORCH_ALLOW_NO_REDIS=1`
Local Worker (`workers/local/worker.ts`) | BRPOP tasks, simulate processing, persist result | Writes to Redis hash or memory via exported helper
Colab Worker (`workers/colab/worker.ipynb`) | Heavy offline/ML style jobs | Direct Redis access required

### Data Keys (Default)
Key | Purpose
----|--------
`tasks:pending` | Pending queue (LPUSH + BRPOP)
`tasks:processed:<id>` | Result hash per task

### Task JSON Shape
```json
{
	"id": "uuid",
	"type": "MUSIC_GENERATE | MIX_DOWN | STEM_SPLIT",
	"prompt": "string",
	"params": { "bpm": 135 },
	"createdAt": 1730000000000
}
```

### Result Hash Fields
Field | Meaning
----- | -------
`id` | Task id
`type` | Task type
`prompt` | Original prompt
`artifacts` | (JSON serialized future) list of produced files/paths
`doneAt` | ms timestamp

### API Endpoints
Method | Path | Description
------ | ---- | -----------
GET | `/health` | Liveness
POST | `/enqueue` | Enqueue a task (202)
GET | `/peek` | Inspect newest task
GET | `/stats` | Queue length + backend
GET | `/results/:id` | Processed task summary

### Local Dev Without Redis
Set `ORCH_ALLOW_NO_REDIS=1` to enable an in-memory queue & result store for quick UI prototyping. Not for multi-process.

## Testing Strategy
| Scope | Approach | Tool |
|-------|----------|------|
| Taxonomy integrity | structural checks | existing script |
| UI smoke | mount minimal components | Vitest + Testing Library |
| Hooks | logic isolation | Vitest |
| Audio scheduling | time-based simulation (fake timers) | Vitest |

## Decisions
- Keep build simple (no monorepo) until audio engine complexity demands isolation.
- Avoid global state libs early; favor hooks + derived props.
- Hash routing (#g=) keeps static hosting trivial.

## Open Questions
- Pattern DSL v2 integration target file layout.
- Tone.js resource lifecycle & memory GC heuristics.
- Whether to introduce worker for audio scheduling jitter reduction.
