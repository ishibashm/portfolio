export interface SpaceWeatherData {
  kpIndex: number | null;
  xrayFlux: string | null;
  solarWindSpeed: number | null;
  timestamp: string | null;
}

export async function fetchSpaceWeather(): Promise<SpaceWeatherData> {
  try {
    // Fetch Kp Index
    // URL: https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json
    // Returns array of arrays: [ ["time_tag", "Kp", "a_running", "station_count"], ["2026-03-08 00:00:00.000", "2.33", "7", "8"], ... ]
    const kpResponse = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { next: { revalidate: 300 } });
    let kpIndex: number | null = null;
    let timestamp: string | null = null;
    
    if (kpResponse.ok) {
      const kpData = await kpResponse.json();
      if (kpData && kpData.length > 0) {
        // Get the latest valid reading (last element)
        const latest = kpData[kpData.length - 1];
        if (Array.isArray(latest)) {
          timestamp = latest[0] || null;
          kpIndex = parseFloat(latest[1]);
        } else if (latest && typeof latest === 'object') {
          timestamp = latest.time_tag || null;
          kpIndex = typeof latest.Kp === 'number' ? latest.Kp : parseFloat(latest.Kp);
        }
        
        // Coerce NaN to null to trigger standard fallback of 3.0 upstream
        if (kpIndex !== null && Number.isNaN(kpIndex)) {
          kpIndex = null;
        }
      }
    }

    // Fetch X-Ray Flux
    // URL: https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json
    // Returns array of objects. We get the latest.
    const xrayResponse = await fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json', { next: { revalidate: 300 } });
    let xrayFlux: string | null = null;
    
    if (xrayResponse.ok) {
      const xrayData = await xrayResponse.json();
      if (xrayData && xrayData.length > 0) {
        const latestFlux = xrayData[xrayData.length - 1];
        // flux is usually a number e.g., 1.5e-6 in Watts/m^2. 
        // 10^-8 to 10^-7 is A/B, 10^-6 is C, 10^-5 is M, 10^-4 is X
        const fluxVal = latestFlux.flux;
        if (fluxVal >= 1e-4) xrayFlux = 'X-CLASS';
        else if (fluxVal >= 1e-5) xrayFlux = 'M-CLASS';
        else if (fluxVal >= 1e-6) xrayFlux = 'C-CLASS';
        else if (fluxVal >= 1e-7) xrayFlux = 'B-CLASS';
        else xrayFlux = 'A-CLASS';
      }
    }

    // Fetch Solar Wind Speed
    const windResponse = await fetch('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', { next: { revalidate: 300 } });
    let solarWindSpeed: number | null = null;

    if (windResponse.ok) {
      const windData = await windResponse.json();
      if (windData && windData.length > 0 && typeof windData[0].proton_speed === 'number') {
        solarWindSpeed = windData[0].proton_speed;
      }
    }

    return {
      kpIndex,
      xrayFlux,
      solarWindSpeed,
      timestamp
    };
  } catch (error) {
    console.error('Error fetching space weather:', error);
    return { kpIndex: null, xrayFlux: null, solarWindSpeed: null, timestamp: null };
  }
}

