import { describe, it, expect } from 'vitest';
import { getClassicalYearStar, getClassicalMonthStar, getClassicalDayStar, getHonmeiStar, calculateVectorCollision, generateBoard } from '../src/utils/ephemerisEngine';
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
    // A we-known date with standard day star, e.g., 2026-05-23
    const targetDate = new Date('2026-05-23T12:00:00+09:00');
    const dayStar = getClassicalDayStar(targetDate);
    
    // Check that it returns a valid star number
    expect(dayStar).toBeGreaterThanOrEqual(1);
    expect(dayStar).toBeLessThanOrEqual(9);
  });

  describe('KigakuScorer Timing and Spatial Blocker Integration', () => {
    it('returns null when targetDirection or coordinates are missing', () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date('2026-07-11T12:00:00+09:00'),
        userBirthDate: new Date('1988-11-25T12:00:00+09:00'),
        userKigakuStar: 3, // Classical Honmei Star for 1988-11-25
        actionType: 'focus' as const,
        useClassical: true
      };
      
      const result = scorer.observe(ctx);
      expect(result).toBeNull();
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
        actionIntent: 'MIGRATION' as const,
        latitude: 35.6895,
        longitude: 139.6917
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      expect(result!.phenomenon).toBe('警告・方位凶殺衝突');
      expect(result!.detail).toContain('【警告・方位凶殺衝突】目的地（E方位）に凶殺「暗剣殺 (大凶)」が検出されています。');
    });

    it('blocks the seasonal Doyou-satsu direction during a Doyou hazard period', () => {
      const targetDate = new Date('2026-07-25T12:00:00+09:00'); // Summer Doyou
      const yB = generateBoard(1);
      const mB = generateBoard(1);
      const dB = generateBoard(1);

      const collision = calculateVectorCollision(
        3, // personalStar
        yB, mB, dB,
        [], // voidZodiacs
        null, // lunarNodeLon
        'DEFAULT',
        targetDate,
        139.6917 // longitude
      );

      // Verify Summer Doyou-satsu blocks SW (坤宮) direction
      expect(collision.doyouState?.inDoyou).toBe(true);
      expect(collision.doyouState?.doyouType).toBe('SUMMER');
      expect(collision.finalVectors.SW).toBe('NOISE_GOU');
    });

    it('applies a soft warning for daily-level blocker under MIGRATION instead of absolute block', () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date('2026-07-04T12:00:00+09:00'), // Day has Center 3, E is NOISE_ANKEN
        userBirthDate: new Date('1988-11-25T12:00:00+09:00'),
        userKigakuStar: 3,
        actionType: 'focus' as const,
        useClassical: true,
        targetDirection: 'E' as const,
        actionIntent: 'MIGRATION' as const,
        latitude: 35.6895,
        longitude: 139.6917
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      expect(result!.phenomenon).toBe('一時的干渉・引越当日注意');
      expect(result!.detail).toContain('【注意・引越当日ノイズ】年盤・月盤の長期的な方位エネルギーは極めて安全（吉）ですが、引越し当日（日盤）に一時的なノイズが重なっています。');
    });

    it('correctly evaluates target direction stars when targetDirection is specified', () => {
      const scorer = new KigakuScorer();
      const ctx = {
        targetDate: new Date('2026-07-11T12:00:00+09:00'),
        userBirthDate: new Date('1988-11-25T12:00:00+09:00'),
        userKigakuStar: 3,
        actionType: 'focus' as const,
        useClassical: true,
        targetDirection: 'E' as const,
        actionIntent: 'DEFAULT' as const,
        latitude: 35.6895,
        longitude: 139.6917
      };

      const result = scorer.observe(ctx);
      expect(result).not.toBeNull();
      // For Center (1, 3, 5) at East direction:
      // Year Center 1 -> E is 8. Wood (3) controls Earth (8) -> 相剋 (Shokoku)
      // Month Center 3 -> E is 1. Water (1) generates Wood (3) -> 相生 (Sojo)
      // Day Center 5 -> E is 3. Wood (3) is same as Wood (3) -> 比和 (Hiwa)
      expect(result!.detail).toContain('[年:8(相剋)] [月:1(相生)] [日:3(比和)]');
    });


    it('applies strict priority gating on layer merging, preventing OPTIMAL from masking noises', () => {
      const yB = generateBoard(1);
      const mB = generateBoard(3);
      const dB = generateBoard(5);

      const collision = calculateVectorCollision(
        3,
        yB, mB, dB,
        [],
        null,
        'MIGRATION',
        new Date('2026-07-11T12:00:00+09:00'),
        139.6917
      );

      // Even with positive Year/Month element phases, presence of NOISE_ANKEN on Month
      // must absolute block and keep the final vector as NOISE_ANKEN.
      expect(collision.finalVectors.E).toBe('NOISE_ANKEN');
    });
  });
});

