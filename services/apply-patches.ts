import fs from 'node:fs';
import path from 'node:path';

export interface ProposedPatch { file: string; body: string; rawBlock: string }
export interface AppliedPatchResult { file: string; status: 'applied' | 'skipped' | 'error'; reason?: string }

// Very simple safety: only allow patches inside src/ or orchestrator/ or services/
const ALLOWED_ROOTS = ['src', 'orchestrator', 'services'];

export function validatePatchTarget(relPath: string): string | null {
  if (!relPath || relPath.includes('..')) return 'path traversal not allowed';
  const first = relPath.split(/[\\/]/)[0];
  if (!ALLOWED_ROOTS.includes(first)) return `root segment '${first}' not in allowlist`;
  if (relPath.endsWith('/')) return 'cannot patch directory';
  return null;
}

export function applyPatches(patches: ProposedPatch[], repoRoot = process.cwd()): AppliedPatchResult[] {
  const results: AppliedPatchResult[] = [];
  for (const p of patches) {
    const err = validatePatchTarget(p.file);
    if (err) { results.push({ file: p.file, status: 'skipped', reason: err }); continue; }
    const abs = path.resolve(repoRoot, p.file);
    try {
      // Body is meant to be full file content (per our contract). We just overwrite.
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, p.body, 'utf8');
      results.push({ file: p.file, status: 'applied' });
    } catch (e: any) {
      results.push({ file: p.file, status: 'error', reason: e.message || String(e) });
    }
  }
  return results;
}
