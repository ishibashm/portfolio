import * as Astronomy from "astronomy-engine";
const { Body } = Astronomy;

export interface EphemerisData {
  source: string;
  planetaryPositions: Record<
    string,
    { longitude: number; latitude: number; constellation: string }
  >;
}

export class EphemerisClient {
  public getPositions(date: Date = new Date()): EphemerisData {
    const bodies = [
      Body.Sun,
      Body.Moon,
      Body.Mercury,
      Body.Venus,
      Body.Mars,
      Body.Jupiter,
      Body.Saturn,
      Body.Uranus,
      Body.Neptune,
      Body.Pluto,
    ];

    const positions: Record<
      string,
      { longitude: number; latitude: number; constellation: string }
    > = {};

    const observer = new Astronomy.Observer(0, 0, 0);

    bodies.forEach((body) => {
      // Get topocentric equatorial coordinates (using dummy observer for geocentric equivalent in this context)
      const eq = Astronomy.Equator(body, date, observer, true, true);
      // Get ecliptic coordinates (longitude, latitude)
      const ecl = Astronomy.Ecliptic(eq.vec);
      const constellation = Astronomy.Constellation(ecl.elon, ecl.elat).name;

      positions[body.toString()] = {
        longitude: ecl.elon,
        latitude: ecl.elat,
        constellation,
      };
    });

    return {
      source: "astronomy-engine (NASA JPL DE431/DE432)",
      planetaryPositions: positions,
    };
  }
}
