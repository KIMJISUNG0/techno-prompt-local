# Orchestrator Slimming Plan

Goal: Keep only the minimal music prompt API and remove all unused orchestration / council / memory features safely in a later step (pending final confirmation).

## Keep
- `services/music/natural.ts`, `services/music/routes-natural.ts`
- `orchestrator/index.ts` (will be simplified)

## Remove (staged)
1. AI Council & Ensemble
   - `services/dev-council*`, `services/model-council.ts`, `services/ensemble.ts`, `services/engines/*`, `services/ai-mock.ts`, `services/apply-patches.ts`
   - Orchestrator routes: `/council`, `/auto-council`, `/dev-council*`, `/ensemble`, metrics routes.
2. Memory system
   - `services/memory/*`, orchestrator `memory-routes.ts`
3. Workflow legacy endpoints `/workflow`
4. Redis queue + task schema (if not needed)

## Simplify Steps
Step A (current): Prepare plan + ensure music endpoint stable (DONE)  
Step B: Add a new lightweight server file (e.g. `orchestrator/music-server.ts`) exposing only `/health`, `/music/*`  
Step C: Remove unused deps from `package.json` (fastify kept; drop ioredis, googleapis if sync not needed)  
Step D: Clean tsconfig includes & re-run typecheck  
Step E: Optional: rename project to reflect narrowed scope.

## Safety / Rollback
- Perform removal in small commits; verify `/music/prompt-natural` always returns 200 & <=200 chars.
- Keep a git tag `pre-slimming` before deletion.

## Open Questions
- Keep Drive sync? (If yes, retain minimal subset of memory store util.)
- Need CORS? (If UI will call from different origin, keep `@fastify/cors`).

> Run this plan only after explicit confirmation to proceed with deletion.