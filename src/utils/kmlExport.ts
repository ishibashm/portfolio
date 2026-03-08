export function getDestinationKML(lat: number, lon: number, bearing: number, distanceKm: number): [number, number] {
  const R = 6371; // Earth radius in km
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (bearing * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceKm / R) +
    Math.cos(lat1) * Math.sin(distanceKm / R) * Math.cos(brng)
  );
  
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(distanceKm / R) * Math.cos(lat1),
    Math.cos(distanceKm / R) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]; // KML needs [lon, lat]
}

function generateArcPolygonCoords(lat: number, lon: number, centerBearing: number, spreadDeg: number, distanceKm: number): string {
  const coords: string[] = [];
  coords.push(`${lon},${lat},0`);
  
  for (let b = centerBearing - spreadDeg; b <= centerBearing + spreadDeg; b += 2) {
    const [pLon, pLat] = getDestinationKML(lat, lon, b, distanceKm);
    coords.push(`${pLon},${pLat},0`);
  }
  
  coords.push(`${lon},${lat},0`);
  return coords.join(' ');
}

function generateCircleCoords(lat: number, lon: number, radiusKm: number): string {
  const coords: string[] = [];
  for (let b = 0; b <= 360; b += 5) {
    const [pLon, pLat] = getDestinationKML(lat, lon, b, radiusKm);
    coords.push(`${pLon},${pLat},0`);
  }
  return coords.join(' ');
}

export function generateMagneticMapKML(lat: number, lon: number, declination: number): string {
  const magNorthBearing = declination;
  const maxRadiusKm = 5000;

  // Safe Zones
  const safeZonesList = [45, 135, 225, 315];
  let safeZonesKML = '';
  safeZonesList.forEach((az) => {
    const coords = generateArcPolygonCoords(lat, lon, magNorthBearing + az, 10, maxRadiusKm);
    safeZonesKML += `
      <Placemark>
        <name>Safe Vector (${az}° Mag)</name>
        <styleUrl>#safeZoneStyle</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>`;
  });

  // Noise Borders
  const boundariesList = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  let noiseZonesKML = '';
  boundariesList.forEach((az) => {
    const coords = generateArcPolygonCoords(lat, lon, magNorthBearing + az, 7.5, maxRadiusKm);
    noiseZonesKML += `
      <Placemark>
        <name>Noise Vector (${az}° Mag)</name>
        <styleUrl>#noiseZoneStyle</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>`;
  });

  // Attenuation Rings
  const attenuationRings = [100, 500, 1000, 2500, 5000]; // km
  let ringsKML = '';
  attenuationRings.forEach((radius) => {
    const coords = generateCircleCoords(lat, lon, radius);
    ringsKML += `
      <Placemark>
        <name>Attenuation Ring (${radius}km)</name>
        <styleUrl>#ringStyle</styleUrl>
        <LineString>
          <tessellate>1</tessellate>
          <coordinates>${coords}</coordinates>
        </LineString>
      </Placemark>`;
  });

  // True North Line
  const [tnLon, tnLat] = getDestinationKML(lat, lon, 0, maxRadiusKm);
  const trueNorthKML = `
    <Placemark>
      <name>True North Vector</name>
      <styleUrl>#trueNorthStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${lon},${lat},0 ${tnLon},${tnLat},0</coordinates>
      </LineString>
    </Placemark>`;

  // Magnetic North Line
  const [mnLon, mnLat] = getDestinationKML(lat, lon, magNorthBearing, maxRadiusKm);
  const magNorthKML = `
    <Placemark>
      <name>Magnetic North Vector (WMM)</name>
      <styleUrl>#magNorthStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${lon},${lat},0 ${mnLon},${mnLat},0</coordinates>
      </LineString>
    </Placemark>`;


  // Compose the KML
  const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Bio-Magnetic Spatial System</name>
    <description>Generated vector data for True North, WMM2020 Magnetic North, Safe Zones, and Noise Vectors.</description>
    
    <Style id="safeZoneStyle">
      <LineStyle><color>ff50c878</color><width>1</width></LineStyle>
      <PolyStyle><color>3350c878</color></PolyStyle>
    </Style>
    
    <Style id="noiseZoneStyle">
      <LineStyle><color>ff0000ff</color><width>1</width></LineStyle>
      <PolyStyle><color>550000ff</color></PolyStyle>
    </Style>

    <Style id="ringStyle">
      <LineStyle><color>ff00aaff</color><width>2</width></LineStyle>
    </Style>

    <Style id="trueNorthStyle">
      <LineStyle><color>ff50c878</color><width>3</width></LineStyle>
    </Style>

    <Style id="magNorthStyle">
      <LineStyle><color>ffff0000</color><width>3</width></LineStyle>
    </Style>

    <Placemark>
      <name>Origin</name>
      <description>Current Coordinates</description>
      <Point>
        <coordinates>${lon},${lat},0</coordinates>
      </Point>
    </Placemark>

    <Folder>
      <name>Reference Vectors</name>
      ${trueNorthKML}
      ${magNorthKML}
    </Folder>

    <Folder>
      <name>Safe Zones (Green)</name>
      ${safeZonesKML}
    </Folder>

    <Folder>
      <name>Noise Borders (Red)</name>
      ${noiseZonesKML}
    </Folder>

    <Folder>
      <name>Shield Attenuation Rings (Amber)</name>
      ${ringsKML}
    </Folder>
  </Document>
</kml>`;

  return kmlString;
}

export function downloadKML(lat: number, lon: number, declination: number) {
  const kmlString = generateMagneticMapKML(lat, lon, declination);
  const blob = new Blob([kmlString], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bio-magnetic_spatial_map_${lat.toFixed(2)}_${lon.toFixed(2)}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
