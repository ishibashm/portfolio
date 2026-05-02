import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  const radius = searchParams.get('radius') || '10'; // default 10km

  if (!lat || !lon) {
    return NextResponse.json({ error: 'Latitude and longitude are required' }, { status: 400 });
  }

  // Simulate external GIS API fetch (e.g., Japan GSI Hazard Map API, USGS, etc.)
  // Real implementation would fetch from an actual GIS server here.
  const hazardData = simulateGisFetch(parseFloat(lat), parseFloat(lon), parseFloat(radius));

  return NextResponse.json(hazardData);
}

function simulateGisFetch(lat: number, lon: number, radiusKm: number) {
  // Generate deterministic but location-dependent hazard mock data
  const seed = (lat * 1000 + lon * 1000) % 100;
  
  const hazards = [];
  
  // Simulated Fault Line (断層帯)
  if (seed % 3 === 0) {
    hazards.push({
      id: `fault-${seed}`,
      type: 'FAULT_LINE',
      name: 'Active Fault Line (Simulated)',
      severity: 'HIGH',
      coordinates: [
        { lat: lat + 0.05, lon: lon - 0.05 },
        { lat: lat - 0.05, lon: lon + 0.05 }
      ]
    });
  }

  // Simulated Flood Zone (浸水想定区域)
  if (seed % 2 === 0) {
    hazards.push({
      id: `flood-${seed}`,
      type: 'FLOOD_ZONE',
      name: 'Flood Risk Area (Simulated)',
      severity: 'MEDIUM',
      center: { lat: lat + 0.02, lon: lon + 0.02 },
      radiusMeters: 2000
    });
  }

  // Simulated Landslide Risk (土砂災害警戒区域)
  if (seed % 5 === 0) {
    hazards.push({
      id: `landslide-${seed}`,
      type: 'LANDSLIDE',
      name: 'Landslide Warning Zone (Simulated)',
      severity: 'CRITICAL',
      center: { lat: lat - 0.03, lon: lon - 0.03 },
      radiusMeters: 1000
    });
  }

  return {
    meta: {
      provider: 'Mock GIS Engine',
      timestamp: new Date().toISOString(),
      location: { lat, lon },
      radiusKm
    },
    hazards,
    riskScore: hazards.reduce((score, h) => {
      if (h.severity === 'CRITICAL') return score + 30;
      if (h.severity === 'HIGH') return score + 20;
      if (h.severity === 'MEDIUM') return score + 10;
      return score;
    }, 0)
  };
}