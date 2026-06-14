import { NextRequest, NextResponse } from "next/server";
import { Body, Observer, AstroTime, Equator, Horizon } from "astronomy-engine";
import { getGeomagneticData } from "@/utils/geomagnetism";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const latStr = req.nextUrl.searchParams.get("lat");
    const lonStr = req.nextUrl.searchParams.get("lon");
    const city = req.nextUrl.searchParams.get("city") || "Unknown";

    if (!latStr || !lonStr) {
      return NextResponse.json(
        { error: "Latitude (lat) and longitude (lon) are required." },
        { status: 400 },
      );
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (
      isNaN(lat) ||
      lat < -90 ||
      lat > 90 ||
      isNaN(lon) ||
      lon < -180 ||
      lon > 180
    ) {
      return NextResponse.json(
        { error: "Coordinates are out of range." },
        { status: 400 },
      );
    }

    const today = new Date();

    // 1. Calculate Solar Coordinates using astronomy-engine
    let solarAzimuth = 180;
    let solarElevation = 45;
    let solarCalcSuccess = false;

    try {
      const observer = new Observer(lat, lon, 0);
      const time = new AstroTime(today);
      const equ = Equator(Body.Sun, time, observer, true, true);
      const hor = Horizon(time, observer, equ.ra, equ.dec, "normal");
      solarAzimuth = hor.azimuth;
      solarElevation = hor.altitude;
      solarCalcSuccess = true;
    } catch (e: any) {
      console.warn("Failed to calculate solar coordinates:", e.message);
    }

    // 2. Fetch Geomagnetic Data via WMM model utility
    let declination = 0;
    let inclination = 0;
    let totalIntensity = 45000; // nT fallback
    let geoCalcSuccess = false;

    try {
      const geoData = await getGeomagneticData(lat, lon, today.getTime());
      if (geoData) {
        declination = geoData.declination;
        inclination = geoData.inclination;
        totalIntensity =
          (geoData as any).totalIntensity || 30000 + Math.abs(lat) * 300;
        geoCalcSuccess = true;
      }
    } catch (e: any) {
      console.warn("Failed to calculate geomagnetism data:", e.message);
    }

    // 3. Space Weather simulation based on Latitude (Aurora active zones get higher simulated index)
    const absLat = Math.abs(lat);
    let simulatedKp = 2.0;
    let auroraChance = 0;

    if (absLat > 55) {
      // High latitude: aurora zone
      simulatedKp = 3.5 + Math.sin(today.getTime() / 60000) * 1.5;
      auroraChance = Math.min(100, Math.round((simulatedKp - 2) * 25));
    } else {
      simulatedKp = 1.5 + Math.sin(today.getTime() / 120000) * 0.8;
      auroraChance = 0;
    }

    const solarWindSpeed =
      350 + simulatedKp * 40 + Math.sin(today.getTime() / 15000) * 20;

    return NextResponse.json({
      city,
      lat,
      lon,
      timestamp: today.toISOString(),
      solar: {
        success: solarCalcSuccess,
        azimuth: solarAzimuth,
        elevation: solarElevation,
      },
      magnetic: {
        success: geoCalcSuccess,
        declination,
        inclination,
        totalIntensity,
      },
      spaceWeather: {
        kpIndex: Math.max(0, parseFloat(simulatedKp.toFixed(2))),
        solarWindSpeed: Math.round(solarWindSpeed),
        auroraChance: Math.max(0, auroraChance),
      },
    });
  } catch (error: any) {
    console.error("Magnetic Monitor API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate telemetry data." },
      { status: 500 },
    );
  }
}
