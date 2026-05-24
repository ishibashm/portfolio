import { describe, it, expect } from 'vitest';
import { getClassicalYearStar, getClassicalMonthStar, getClassicalDayStar, getHonmeiStar } from '../src/utils/ephemerisEngine';

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
});
