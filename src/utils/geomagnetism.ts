// @ts-ignore
import geomagnetism from 'geomagnetism';

export interface GeomagneticData {
  declination: number; // D (degrees)
  inclination: number; // I (degrees)
  intensity: number;   // F (nanoTeslas)
  horizontal: number;  // H
  x: number;
  y: number;
  z: number;
}

export function getGeomagneticData(lat: number, lon: number, date: Date = new Date()): GeomagneticData | null {
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
        z: info.z
      };
    }
    return null;
  } catch (error) {
    console.error('Error calculating geomagnetism:', error);
    return null;
  }
}
