import { SwissEphemerisEngine, CelestialBody, AyanamsaSystem } from './swissEphemerisEngine';

export const NAKSHATRAS = [
  'Ashvini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
];

export interface NakshatraData {
  index: number;
  name: string;
  pada: number; // 1, 2, 3, or 4
  longitudeRemaining: number; // percentage through the Nakshatra (0-1)
}

export interface VedicChartData {
  date: Date;
  ayanamsa: number;
  ayanamsaSystem: AyanamsaSystem;
  moonNakshatra: NakshatraData;
  sunNakshatra: NakshatraData;
  ascendantNakshatra?: NakshatraData; // If time/location is precise
}

export class VedicEngine {
  private swissEngine: SwissEphemerisEngine;

  constructor() {
    this.swissEngine = SwissEphemerisEngine.getInstance();
  }

  /**
   * Calculate the Nakshatra and Pada for a given sidereal longitude.
   * There are 27 Nakshatras, each spanning 13° 20' (13.3333... degrees).
   * Each Nakshatra has 4 Padas, each spanning 3° 20' (3.3333... degrees).
   */
  public getNakshatra(siderealLongitude: number): NakshatraData {
    // Ensure longitude is between 0 and 360
    let lon = siderealLongitude % 360;
    if (lon < 0) lon += 360;

    const NAKSHATRA_SPAN = 360 / 27; // 13.333333...
    const PADA_SPAN = NAKSHATRA_SPAN / 4; // 3.333333...

    const nakshatraIndex = Math.floor(lon / NAKSHATRA_SPAN);
    const longitudeWithinNakshatra = lon - (nakshatraIndex * NAKSHATRA_SPAN);
    
    const pada = Math.floor(longitudeWithinNakshatra / PADA_SPAN) + 1;
    const progress = longitudeWithinNakshatra / NAKSHATRA_SPAN;

    return {
      index: nakshatraIndex,
      name: NAKSHATRAS[nakshatraIndex],
      pada: pada,
      longitudeRemaining: progress
    };
  }

  /**
   * Generates base Vedic chart data, including Moon and Sun Nakshatras.
   * The Moon's Nakshatra (Janma Nakshatra) is the most critical element in Vedic astrology.
   */
  public generateVedicChart(date: Date, system: AyanamsaSystem = AyanamsaSystem.Lahiri): VedicChartData {
    const ayanamsa = this.swissEngine.getAyanamsa(date, system);
    
    // Pass true for sidereal to get Vedic coordinates
    const moonPos = this.swissEngine.getPlanetCoordinates(date, CelestialBody.Moon, true);
    const sunPos = this.swissEngine.getPlanetCoordinates(date, CelestialBody.Sun, true);

    const moonNakshatra = this.getNakshatra(moonPos.longitude);
    const sunNakshatra = this.getNakshatra(sunPos.longitude);

    return {
      date,
      ayanamsa,
      ayanamsaSystem: system,
      moonNakshatra,
      sunNakshatra
    };
  }
}
