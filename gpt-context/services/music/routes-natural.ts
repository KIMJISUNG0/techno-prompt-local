import type { FastifyInstance } from 'fastify';
import { buildFunkNaturalPrompt, funkNaturalPresets, type FunkNLInput } from './natural';

function sanitizeBody(b:any): FunkNLInput {
  const sub = Array.isArray(b?.substyles) ? b.substyles.filter(Boolean).slice(0,2) : [];
  const fx  = Array.isArray(b?.fx) ? b.fx.filter(Boolean).slice(0,2) : [];
  const mix = Array.isArray(b?.mix) ? b.mix.filter(Boolean).slice(0,2) : [];
  const instruments = Array.isArray(b?.instruments) ? b.instruments.filter(Boolean) : undefined;
  const arr = Array.isArray(b?.arrangement) ? b.arrangement
    .filter((x:any)=> x && x.section && typeof x.bars==='number' && x.bars>0)
    .map((x:any)=> ({ section: x.section, bars: x.bars })) : undefined;

  return {
    substyles: sub,
    bpm: typeof b?.bpm==='number' ? b.bpm : undefined,
    meter: ['4/4','3/4','6/8'].includes(b?.meter) ? b.meter : undefined,
    key: typeof b?.key==='string' ? b.key : undefined,
    repeats: typeof b?.repeats==='number' ? b.repeats : undefined,
    hookBars: typeof b?.hookBars==='number' ? b.hookBars : undefined,
    instruments,
    groove: typeof b?.groove==='string' ? b.groove : undefined,
    fx, mix,
    arrangement: arr,
    includeLengthHint: Boolean(b?.includeLengthHint),
  };
}

export function registerMusicNaturalRoutes(fastify: FastifyInstance){
  fastify.get('/music/presets-natural', async (_req, _rep) => {
    return { items: funkNaturalPresets() };
  });

  fastify.post('/music/prompt-natural', async (req, rep) => {
    const body = sanitizeBody(req.body);
    const debugFlag = (req.query as any)?.debug === '1' || (req.body as any)?.debug === true;
    const result = buildFunkNaturalPrompt({ ...body, debug: debugFlag });
    return result;
  });
}
