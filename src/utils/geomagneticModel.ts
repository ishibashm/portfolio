/*
  geomagnetism は package.json の "types" で geomagnetism.d.ts を配っている。
  以前は // @ts-ignore を付けていたが、型が無いわけではなかった。付けたままだと
  model の戻り値も any になり、point() の綴りを間違えても気付けない。
*/
import geomagnetism from "geomagnetism";
import type { GeomagnetismModel } from "geomagnetism";

/**
 * 地磁気の計算（WMM）。**server action ではない素の関数。**
 *
 * もとは utils/geomagnetism（"use server"）の中にだけあった。画面から
 * 偏角を引きたい部品（羅盤の立体）は server action を呼ぶと往復が要り、
 * テストでも動かない。計算はここに 1 つだけ置き、server action はこれを
 * 呼ぶだけにする（同じ計算を 2 か所に書かない）。
 *
 * モデルの表（係数）は 1 つ 4KB 弱で、4 つ入っている。
 */

export interface GeomagneticData {
  declination: number; // D (degrees)
  inclination: number; // I (degrees)
  intensity: number; // F (nanoTeslas)
  horizontal: number; // H
  x: number;
  y: number;
  z: number;
}

export function geomagneticAt(
  lat: number,
  lon: number,
  timestamp: number = Date.now(),
): GeomagneticData | null {
  let date = new Date(timestamp);
  let model: GeomagnetismModel | null = null;

  // Try to load the model with the requested date.
  // Catch RangeErrors if the model validity period in the installed library version is exceeded.
  try {
    model = geomagnetism.model(date);
  } catch {
    // Fallback 1: Try WMM-2020 limit (typically valid up to Dec 10, 2024)
    try {
      date = new Date("2024-12-01");
      model = geomagnetism.model(date);
    } catch {
      // Fallback 2: Try WMM-2015 max limit
      try {
        date = new Date("2019-12-14");
        model = geomagnetism.model(date);
      } catch {
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
