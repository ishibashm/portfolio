import {
  SwissEphemerisEngine,
  CelestialBody,
  AyanamsaSystem,
} from "./swissEphemerisEngine";

export const NAKSHATRAS = [
  "Ashvini",
  "Bharani",
  "Krittika",
  "Rohini",
  "Mrigashira",
  "Ardra",
  "Punarvasu",
  "Pushya",
  "Ashlesha",
  "Magha",
  "Purva Phalguni",
  "Uttara Phalguni",
  "Hasta",
  "Chitra",
  "Swati",
  "Vishakha",
  "Anuradha",
  "Jyeshtha",
  "Mula",
  "Purva Ashadha",
  "Uttara Ashadha",
  "Shravana",
  "Dhanishta",
  "Shatabhisha",
  "Purva Bhadrapada",
  "Uttara Bhadrapada",
  "Revati",
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
  planetaryNakshatras: Record<string, NakshatraData>;
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
    const longitudeWithinNakshatra = lon - nakshatraIndex * NAKSHATRA_SPAN;

    const pada = Math.floor(longitudeWithinNakshatra / PADA_SPAN) + 1;
    const progress = longitudeWithinNakshatra / NAKSHATRA_SPAN;

    return {
      index: nakshatraIndex,
      name: NAKSHATRAS[nakshatraIndex],
      pada: pada,
      longitudeRemaining: progress,
    };
  }

  /**
   * Generates base Vedic chart data, including Moon and Sun Nakshatras.
   * The Moon's Nakshatra (Janma Nakshatra) is the most critical element in Vedic astrology.
   */
  public generateVedicChart(
    date: Date,
    system: AyanamsaSystem = AyanamsaSystem.Lahiri,
  ): VedicChartData {
    const ayanamsa = this.swissEngine.getAyanamsa(date, system);

    // Pass true for sidereal to get Vedic coordinates
    const moonPos = this.swissEngine.getPlanetCoordinates(
      date,
      CelestialBody.Moon,
      true,
    );
    const sunPos = this.swissEngine.getPlanetCoordinates(
      date,
      CelestialBody.Sun,
      true,
    );

    const moonNakshatra = this.getNakshatra(moonPos.longitude);
    const sunNakshatra = this.getNakshatra(sunPos.longitude);

    const planetaryNakshatras: Record<string, NakshatraData> = {};
    const bodies = [
      { name: "Sun", body: CelestialBody.Sun },
      { name: "Moon", body: CelestialBody.Moon },
      { name: "Mercury", body: CelestialBody.Mercury },
      { name: "Venus", body: CelestialBody.Venus },
      { name: "Mars", body: CelestialBody.Mars },
      { name: "Jupiter", body: CelestialBody.Jupiter },
      { name: "Saturn", body: CelestialBody.Saturn },
      { name: "Uranus", body: CelestialBody.Uranus },
      { name: "Neptune", body: CelestialBody.Neptune },
      { name: "Pluto", body: CelestialBody.Pluto },
    ];

    for (const b of bodies) {
      const pos = this.swissEngine.getPlanetCoordinates(date, b.body, true);
      planetaryNakshatras[b.name] = this.getNakshatra(pos.longitude);
    }

    return {
      date,
      ayanamsa,
      ayanamsaSystem: system,
      moonNakshatra,
      sunNakshatra,
      planetaryNakshatras,
    };
  }

  /**
   * Calculates the active Vimshottari Dasha (Mahadasha and Antardasha)
   * for a given birth date and evaluation date.
   */
  public calculateVimshottariDasha(
    birthDate: Date,
    evaluationDate: Date,
  ): { mahadasha: string; antardasha: string; formatted: string } {
    // 1. Generate birth chart using Lahiri to get the birth Moon Nakshatra and progress
    const birthChart = this.generateVedicChart(birthDate);
    
    // Nakshatras are 0-indexed, each spans 13.333333 degrees.
    const nakshatraIndex = birthChart.moonNakshatra.index;
    const progress = birthChart.moonNakshatra.longitudeRemaining; // 0 to 1

    const LORDS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
    const LORDS_JA = ["ケートゥ", "金星", "太陽", "月", "火星", "ラーフ", "木星", "土星", "水星"];
    const LORD_YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];
    const TOTAL_CYCLE_YEARS = 120;

    // The starting Dasha lord is based on the Nakshatra index
    const startLordIndex = nakshatraIndex % 9;
    
    // Remaining time in the first Dasha (in milliseconds)
    const firstDashaYears = (1 - progress) * LORD_YEARS[startLordIndex];
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const firstDashaEndMs = birthDate.getTime() + firstDashaYears * msPerYear;

    const evalMs = evaluationDate.getTime();

    let activeMahadashaIndex = 0;
    let activeMahadashaStartMs = birthDate.getTime();
    let activeMahadashaEndMs = firstDashaEndMs;

    if (evalMs < firstDashaEndMs) {
      activeMahadashaIndex = startLordIndex;
      activeMahadashaStartMs = birthDate.getTime();
      activeMahadashaEndMs = firstDashaEndMs;
    } else {
      let currentEndMs = firstDashaEndMs;
      let currentLordIndex = (startLordIndex + 1) % 9;
      
      while (currentEndMs <= evalMs) {
        const startMs = currentEndMs;
        const years = LORD_YEARS[currentLordIndex];
        currentEndMs += years * msPerYear;
        
        if (evalMs < currentEndMs) {
          activeMahadashaIndex = currentLordIndex;
          activeMahadashaStartMs = startMs;
          activeMahadashaEndMs = currentEndMs;
          break;
        }
        currentLordIndex = (currentLordIndex + 1) % 9;
        
        // Safety guard for extremely far future evaluation dates
        if (currentEndMs - birthDate.getTime() > 200 * msPerYear) {
          break; 
        }
      }
    }

    // Calculate the Antardasha (Bhukti) within the active Mahadasha
    const mahadashaLord = LORDS[activeMahadashaIndex];
    const mahadashaLordJa = LORDS_JA[activeMahadashaIndex];

    let activeAntardashaIndex = 0;
    let currentAntardashaEndMs = activeMahadashaStartMs;

    for (let i = 0; i < 9; i++) {
      const lordIndex = (activeMahadashaIndex + i) % 9;
      // Antardasha duration is proportional to (Mahadasha Years * Antardasha Years / 120)
      const antardashaYears = (LORD_YEARS[activeMahadashaIndex] * LORD_YEARS[lordIndex]) / TOTAL_CYCLE_YEARS;
      currentAntardashaEndMs += antardashaYears * msPerYear;

      if (evalMs < currentAntardashaEndMs) {
        activeAntardashaIndex = lordIndex;
        break;
      }
    }

    const antardashaLord = LORDS[activeAntardashaIndex];
    const antardashaLordJa = LORDS_JA[activeAntardashaIndex];

    const formatted = `${mahadashaLordJa}-${antardashaLordJa}期 (${mahadashaLord}-${antardashaLord})`;

    return {
      mahadasha: mahadashaLord,
      antardasha: antardashaLord,
      formatted,
    };
  }
}
