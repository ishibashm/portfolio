import {
  Body,
  Observer,
  Equator,
  Ecliptic,
  AstroTime,
  SiderealTime,
} from "astronomy-engine";

/**
 * ---------------------------------------------------------------------------
 * Swiss Ephemeris Engine (Placeholder / Fallback Implementation)
 * ---------------------------------------------------------------------------
 *
 * Objective:
 * Establish a robust, professional-grade astronomical calculation pipeline for
 * superior accuracy in house calculations, transit/aspect management, and
 * Vedic astrology support.
 *
 * NOTE ON ENVIRONMENT:
 * The native `swisseph` package requires a C++ build environment (Visual Studio)
 * which is currently unavailable on this Windows machine.
 * The `sweph-wasm` alternative has a known internal `fetch` bug in Node.js environments.
 *
 * As an immediate step, this engine defines the EXACT interfaces needed for the
 * metaphysical engine, currently falling back to high-precision `astronomy-engine` (VSOP87)
 * for mathematical parity. Once the build environment is resolved, the internal
 * implementation here will swap to the native `swisseph` bindings without affecting
 * the rest of the application.
 */

// Define standard planetary bodies for metaphysical engines
export enum CelestialBody {
  Sun = "Sun",
  Moon = "Moon",
  Mercury = "Mercury",
  Venus = "Venus",
  Mars = "Mars",
  Jupiter = "Jupiter",
  Saturn = "Saturn",
  Uranus = "Uranus",
  Neptune = "Neptune",
  Pluto = "Pluto",
  NorthNode = "NorthNode", // Rahu
  SouthNode = "SouthNode", // Ketu
}

// Define the Zodiac signs
export const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

export enum AyanamsaSystem {
  Lahiri = "Lahiri", // Default for Vedic (approx 23.85 at J2000)
  FaganBradley = "FaganBradley",
  Raman = "Raman",
}

export interface CelestialCoordinates {
  longitude: number;
  latitude: number;
  distance: number; // AU
  speed: number; // degrees per day (if available)
  zodiacSign: string;
}

export interface HouseData {
  ascendant: number;
  mc: number;
  cusps: number[];
}

export interface AspectData {
  body1: CelestialBody;
  body2: CelestialBody;
  aspect: string; // e.g., "Trine", "Square"
  orb: number;
  angle: number;
}

export class SwissEphemerisEngine {
  private static instance: SwissEphemerisEngine;

  private constructor() {
    // Initialization for native swisseph would happen here
    // e.g. setting ephemeris path: sweph.swe_set_ephe_path('./ephe')
  }

  public static getInstance(): SwissEphemerisEngine {
    if (!SwissEphemerisEngine.instance) {
      SwissEphemerisEngine.instance = new SwissEphemerisEngine();
    }
    return SwissEphemerisEngine.instance;
  }

  /**
   * Convert body enum to Astronomy Engine body
   */
  private getAstroBody(body: CelestialBody): Body | null {
    switch (body) {
      case CelestialBody.Sun:
        return Body.Sun;
      case CelestialBody.Moon:
        return Body.Moon;
      case CelestialBody.Mercury:
        return Body.Mercury;
      case CelestialBody.Venus:
        return Body.Venus;
      case CelestialBody.Mars:
        return Body.Mars;
      case CelestialBody.Jupiter:
        return Body.Jupiter;
      case CelestialBody.Saturn:
        return Body.Saturn;
      case CelestialBody.Uranus:
        return Body.Uranus;
      case CelestialBody.Neptune:
        return Body.Neptune;
      case CelestialBody.Pluto:
        return Body.Pluto;
      default:
        return null;
    }
  }

  /**
   * Calculate Ayanamsa (precession of equinoxes)
   * This is an approximation since native swisseph is not available.
   * Based on Lahiri Ayanamsa (approx 23.85 deg at J2000.0, increasing by 50.29 arcsec/year)
   */
  public getAyanamsa(
    date: Date,
    system: AyanamsaSystem = AyanamsaSystem.Lahiri,
  ): number {
    const j2000 = new Date("2000-01-01T12:00:00Z");
    const yearsSince2000 =
      (date.getTime() - j2000.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

    let baseAyanamsa = 23.85;
    switch (system) {
      case AyanamsaSystem.Raman:
        baseAyanamsa = 22.46;
        break;
      case AyanamsaSystem.FaganBradley:
        baseAyanamsa = 24.75;
        break;
      case AyanamsaSystem.Lahiri:
      default:
        baseAyanamsa = 23.85;
        break;
    }

    // Precession rate is approx 50.290966 arc seconds per year = 0.0139697 degrees/year
    const precessionRate = 0.0139697;
    return baseAyanamsa + yearsSince2000 * precessionRate;
  }

  /**
   * Calculates longitude speed in degrees per day using 12-hour delta-t sampling.
   */
  public getPlanetSpeed(date: Date, body: CelestialBody): number {
    const astroBody = this.getAstroBody(body);
    if (!astroBody) return 0;

    // Sample coordinates at date - 6 hours and date + 6 hours
    const dt = 0.5; // Total difference of 12 hours = 0.5 days
    const t1 = new Date(date.getTime() - 6 * 60 * 60 * 1000);
    const t2 = new Date(date.getTime() + 6 * 60 * 60 * 1000);

    const observer = new Observer(0, 0, 0); // Geocentric

    const eq1 = Equator(astroBody, t1, observer, true, true);
    const ecl1 = Ecliptic(eq1.vec);
    let lon1 = ecl1.elon;
    if (lon1 < 0) lon1 += 360;

    const eq2 = Equator(astroBody, t2, observer, true, true);
    const ecl2 = Ecliptic(eq2.vec);
    let lon2 = ecl2.elon;
    if (lon2 < 0) lon2 += 360;

    let diff = lon2 - lon1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    return diff / dt; // Speed in degrees per day
  }

  /**
   * Calculates high-precision planetary coordinates
   * @param sidereal If true, subtracts Ayanamsa to return sidereal (Vedic) coordinates
   */
  public getPlanetCoordinates(
    date: Date,
    body: CelestialBody,
    sidereal: boolean = false,
  ): CelestialCoordinates {
    const astroBody = this.getAstroBody(body);

    if (!astroBody) {
      // Mock for Lunar Nodes (since Astronomy Engine doesn't natively expose them easily)
      return {
        longitude: 0,
        latitude: 0,
        distance: 1,
        speed: 0,
        zodiacSign: "Aries",
      };
    }

    // High precision ecliptic coordinates (J2000 equinox)
    const observer = new Observer(0, 0, 0); // Geocentric
    const eq = Equator(astroBody, date, observer, true, true);
    const ecl = Ecliptic(eq.vec);

    let lon = ecl.elon;
    if (lon < 0) lon += 360;

    if (sidereal) {
      const ayanamsa = this.getAyanamsa(date);
      lon -= ayanamsa;
      if (lon < 0) lon += 360;
    }

    const signIndex = Math.floor(lon / 30);
    const speed = this.getPlanetSpeed(date, body);

    return {
      longitude: lon,
      latitude: ecl.elat,
      distance: eq.vec.Length(), // Vector length in AU
      speed,
      zodiacSign: ZODIAC_SIGNS[signIndex],
    };
  }

  /**
   * Calculate Astrological Houses (Placidus system default)
   */
  public getHouses(
    date: Date,
    latitude: number,
    longitude: number,
    system: "P" | "K" | "W" = "P",
  ): HouseData {
    // Note: Astronomy Engine does not have native Placidus house calculations.
    // This is a placeholder that calculates the Ascendant/MC roughly using
    // local sidereal time, waiting for true swisseph replacement.

    const lat =
      typeof latitude === "number" && !isNaN(latitude) ? latitude : 35.6895;
    const lon =
      typeof longitude === "number" && !isNaN(longitude) ? longitude : 139.6917;
    const obs = new Observer(lat, lon, 0);
    const time = new AstroTime(date);

    // True Sidereal Time at Greenwich
    const gst = SiderealTime(time);

    // Local Sidereal Time wrapped strictly to [0, 24)
    let lst = gst + longitude / 15.0;
    lst = ((lst % 24) + 24) % 24;

    // Approximate MC (Midheaven) based on RAMC
    const ramc = lst * 15; // in degrees
    const obl = 23.4392911; // obliquity of the ecliptic

    const rad = Math.PI / 180;
    let mc = Math.atan2(Math.tan(ramc * rad), Math.cos(obl * rad)) / rad;
    if (mc < 0) mc += 360;

    // Approximate Ascendant
    const ascRad = Math.atan2(
      Math.cos(ramc * rad),
      -(
        Math.sin(ramc * rad) * Math.cos(obl * rad) +
        Math.tan(latitude * rad) * Math.sin(obl * rad)
      ),
    );
    let asc = ascRad / rad;
    if (asc < 0) asc += 360;

    return {
      ascendant: asc,
      mc: mc,
      cusps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Placeholder for full 12 cusps
    };
  }

  /**
   * Calculate major aspects between two bodies
   */
  public getAspect(
    body1: CelestialBody,
    body2: CelestialBody,
    date: Date,
  ): AspectData | null {
    const pos1 = this.getPlanetCoordinates(date, body1);
    const pos2 = this.getPlanetCoordinates(date, body2);

    let diff = Math.abs(pos1.longitude - pos2.longitude);
    if (diff > 180) diff = 360 - diff;

    // Standard Orbs (approximate)
    const orbs = [
      { aspect: "Conjunction", angle: 0, orb: 8 },
      { aspect: "Sextile", angle: 60, orb: 6 },
      { aspect: "Square", angle: 90, orb: 7 },
      { aspect: "Trine", angle: 120, orb: 7 },
      { aspect: "Opposition", angle: 180, orb: 8 },
    ];

    for (const asp of orbs) {
      if (Math.abs(diff - asp.angle) <= asp.orb) {
        return {
          body1,
          body2,
          aspect: asp.aspect,
          orb: Math.abs(diff - asp.angle),
          angle: diff,
        };
      }
    }

    return null;
  }
}
