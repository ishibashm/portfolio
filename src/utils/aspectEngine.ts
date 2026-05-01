import { AstroEngine } from './ephemerisEngine';

export type AspectType = 'CONJUNCTION' | 'OPPOSITION' | 'SQUARE' | 'TRINE' | 'SEXTILE';

export interface Aspect {
  body1: string;
  body2: string;
  type: AspectType;
  angle: number;
  orb: number;
}

const ASPECT_DEFINITIONS: Record<AspectType, number> = {
  CONJUNCTION: 0,
  OPPOSITION: 180,
  SQUARE: 90,
  TRINE: 120,
  SEXTILE: 60
};

export class AspectEngine {
  /**
   * Calculates major aspects between all main celestial bodies for a given date.
   */
  public static calculateAspects(date: Date, orb: number = 5): Aspect[] {
    const bodies = [
      { name: 'Sun', lon: AstroEngine.getSolarLongitude(date) },
      { name: 'Moon', lon: AstroEngine.getLunarLongitude(date) },
      { name: 'Mercury', lon: AstroEngine.getMercuryLongitude(date) },
      { name: 'Venus', lon: AstroEngine.getVenusLongitude(date) },
      { name: 'Mars', lon: AstroEngine.getMarsLongitude(date) },
      { name: 'Jupiter', lon: AstroEngine.getJupiterLongitude(date) },
      { name: 'Saturn', lon: AstroEngine.getSaturnLongitude(date) },
      { name: 'Uranus', lon: AstroEngine.getUranusLongitude(date) },
      { name: 'Neptune', lon: AstroEngine.getNeptuneLongitude(date) },
      { name: 'Pluto', lon: AstroEngine.getPlutoLongitude(date) }
    ];

    const aspects: Aspect[] = [];

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const b1 = bodies[i];
        const b2 = bodies[j];
        
        let diff = Math.abs(b1.lon - b2.lon);
        if (diff > 180) diff = 360 - diff;

        for (const [type, targetAngle] of Object.entries(ASPECT_DEFINITIONS)) {
          const currentOrb = Math.abs(diff - targetAngle);
          if (currentOrb <= orb) {
            aspects.push({
              body1: b1.name,
              body2: b2.name,
              type: type as AspectType,
              angle: diff,
              orb: currentOrb
            });
          }
        }
      }
    }

    return aspects;
  }

  /**
   * Formats aspects into human-readable strings.
   */
  public static formatAspects(aspects: Aspect[]): string[] {
    return aspects.map(a => `${a.body1} ${a.type} ${a.body2} (Orb: ${a.orb.toFixed(2)}°)`);
  }
}
