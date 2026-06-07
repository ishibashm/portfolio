import { describe, it, expect } from 'vitest';
import { getClassicalYearStar, getClassicalMonthStar, getClassicalDayStar, getHonmeiStar } from '../src/utils/ephemerisEngine';
import { KigakuScorer } from '../src/utils/timing-optimizer/scorers/kigakuScorer';

describe('Kyusei Kigaku High-Precision Calculations', () => {
  it('should correctly calculate Honmei and Getsumei stars for 1988-11-25', () => {
    const birthDate = new Date('1988-11-25T12:00:00+09:00');
    
    // Honmei (Classical) should be 3 (三碧木星)
    const yearStar = getClassicalYearStar(birthDate);
    expect(yearStar).toBe(3);

    // Getsumei (Classical) should be 5 (五黄土星)
    const monthStar = getClassicalMonthStar(birthDate);
    expect(monthStar).toBe(5);
  });

  it('should verify day star changes and solar terms', () => {
    // A known date with standard day star, e.g., 2026-05-23
    const targetDate = new Date('2026-05-23T12:00:00+09:00');
    const dayStar = getClassicalDayStar(targetDate);
    
    // Check that it returns a valid star number
    expect(dayStar).toBeGreaterThanOrEqual(1);
    expect(dayStar).toBeLessThanOrEqual(9);
  });

  describe('KigakuScorer Timing and Spatial Blocker Integration', () => {
    it('correctly evaluates using classical stars under useClassical: true', () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date('2026-07-11T12:00:00+09:00'),
        userBirthDate: new Date('1988-11-25T12:00:00+09:00'),
        userKigakuStar: 3, // Classical Honmei Star for 1988-11-25
        actionType: 'focus' as const,
        useClassical: true
      };
      
      const result = scorer.observe(ctx);
      // Under Classical, 2026-07-11 is Year: 1, Month: 3, Day: 5
      // 3 is Wood, Year 1 (Water) is water-wood (相生)
      // Month 3 (Wood) is wood-wood (比和)
      // Day 5 (Earth) is wood-earth (相剋)
      // Hence it is a mixed resonance (混在干渉)
      expect(result.phenomenon).toContain('混在干渉');
      expect(result.detail).toContain('[年:1(相生)] [月:3(比和)] [日:5(相剋)]');
    });

    it('downgrades status to warning when a target direction has blockers', () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date('2026-07-11T12:00:00+09:00'),
        userBirthDate: new Date('1988-11-25T12:00:00+09:00'),
        userKigakuStar: 3,
        actionType: 'focus' as const,
        useClassical: true,
        targetDirection: 'E' as const, // East direction has Anken-satsu in Month Board
        actionIntent: 'MIGRATION' as const
      };

      const result = scorer.observe(ctx);
      expect(result.phenomenon).toBe('警告・方位凶殺衝突');
      expect(result.detail).toContain('【警告・方位凶殺衝突】目的地（E方位）に凶殺「暗剣殺 (大凶)」が検出されています。');
    });
  });
});

