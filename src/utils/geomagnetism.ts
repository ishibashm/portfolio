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

  // Clamp date to the validity range of the geomagnetism WMM-2015 model
  // to prevent "Model is only valid from Mon Dec 15 2014 to Sun Dec 15 2019" errors.
  const minDate = new Date("2014-12-16");
  const maxDate = new Date("2019-12-14");
  if (date < minDate) {
    date = minDate;
  } else if (date > maxDate) {
    date = maxDate;
  }

  try {
    const model = geomagnetism.model(date);
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
