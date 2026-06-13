"use server";

// @ts-ignore
import geomagnetism from "geomagnetism";

export interface GeomagneticData {
  declination: number; // D (degrees)
  inclination: number; // I (degrees)
  intensity: number; // F (nanoTeslas)
  horizontal: number; // H
  x: number;
  y: number;
  z: number;
}

export async function getGeomagneticData(
  lat: number,
  lon: number,
  timestamp: number = Date.now(),
): Promise<GeomagneticData | null> {
  let date = new Date(timestamp);
  let model: any = null;

  // Try to load the model with the requested date.
  // Catch RangeErrors if the model validity period in the installed library version is exceeded.
  try {
    model = geomagnetism.model(date);
  } catch (e) {
    // Fallback 1: Try WMM-2020 limit (typically valid up to Dec 10, 2024)
    try {
      date = new Date("2024-12-01");
      model = geomagnetism.model(date);
    } catch (e2) {
      // Fallback 2: Try WMM-2015 max limit
      try {
        date = new Date("2019-12-14");
        model = geomagnetism.model(date);
      } catch (e3) {
        // Fallback 3: Try WMM-2015 min limit
        try {
          date = new Date("2014-12-16");
          model = geomagnetism.model(date);
        } catch (e4) {
          console.error("All geomagnetism model fallbacks failed:", e4);
          return null;
        }
      }
    }
  }

  try {
    if (!model) return null;
    const info = model.point([lat, lon]);

    if (info) {
      return {
        declination: info.decl,
        inclination: info.incl,
        intensity: info.f,
        horizontal: info.h,
        x: info.x,
        y: info.y,
        z: info.z,
      };
    }
    return null;
  } catch (error) {
    console.error("Error calculating geomagnetism:", error);
    return null;
  }
}
