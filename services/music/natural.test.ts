import { describe, it, expect } from 'vitest';
import { buildFunkNaturalPrompt } from './natural';

describe('buildFunkNaturalPrompt', () => {
  it('정상 시나리오: 200자 이하, warnings 없음, compressionRatio <= 1', () => {
    const r = buildFunkNaturalPrompt({
      substyles: ['P-Funk','G-Funk'],
      bpm: 106,
      groove: 'swung 16th hats, tight backbeat',
      fx: ['tape saturation','light plate reverb'],
      mix: ['punchy','warm'],
      includeLengthHint: true,
      arrangement: [
        { section: 'intro', bars: 8 },
        { section: 'hook', bars: 16 }
      ],
      debug: true
    });
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r.debug).toBeDefined();
    expect(r.debug?.truncated).toBe(false);
    expect(r.debug?.warnings).toBeDefined();
    expect(r.debug?.warnings?.length).toBe(0);
    expect(r.debug?.originalLength).toBeGreaterThan(0);
    expect(r.debug?.compressionRatio).toBeGreaterThan(0);
    expect(r.debug?.compressionRatio).toBeLessThanOrEqual(1);
  });

  it('과도 길이 -> 하드 트렁케이션 + warnings(truncated) + shrink-instruments 단계 포함', () => {
    const longName = 'superlonginstrumentwithmanycharacters';
    const instruments = [longName+'1', longName+'2', longName+'3', longName+'4', longName+'5', longName+'6'];
    const r = buildFunkNaturalPrompt({
      instruments,
      includeLengthHint: true,
      // 길이문구 유도용 간단한 arrangement
      arrangement: [ { section: 'hook', bars: 64 } ],
      debug: true
    });
    expect(r.debug).toBeDefined();
    // 하드 트렁케이션 수행되었는지
    expect(r.debug?.truncated).toBe(true);
    expect(r.length).toBeLessThanOrEqual(200);
    // warnings에 truncated 포함
    expect(r.debug?.warnings).toContain('truncated');
    // stage 라벨에 shrink-instruments, drop-length, hard-truncate 가 최소 한 번씩 존재
    const labels = r.debug?.stages.map(s => s.label) || [];
    expect(labels).toContain('drop-length');
    expect(labels).toContain('shrink-instruments');
    expect(labels).toContain('hard-truncate');
    // 압축률은 1 미만이어야 함
    expect(r.debug?.compressionRatio).toBeLessThan(1);
  });

  it('낮은 다양성(low_diversity) 경고 발생', () => {
    const r = buildFunkNaturalPrompt({
      // 중복 악기명으로 어휘 다양성 낮추기
      instruments: ['bass','bass','bass','bass','bass','bass'],
      // groove에도 bass 반복 삽입
      groove: 'bass bass bass bass bass bass bass',
      repeats: 2,
      hookBars: 2,
      debug: true
    });
    expect(r.length).toBeLessThanOrEqual(200);
    expect(r.debug).toBeDefined();
    expect(r.debug?.warnings).toContain('low_diversity');
    expect(r.debug?.diversity).toBeLessThan(0.75);
  });
});
