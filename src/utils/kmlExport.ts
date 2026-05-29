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

export function generateMagneticMapKML(
  lat: number,
  lon: number,
  declination: number,
  useTrueNorth: boolean = false,
  vectors?: Record<string, string>
): string {
  const magNorthBearing = useTrueNorth ? 0 : declination;
  const maxRadiusKm = 5000;

  // Directions mapping
  const directions = [
    { dir: 'N', deg: 0, isCorner: false },
    { dir: 'NE', deg: 45, isCorner: true },
    { dir: 'E', deg: 90, isCorner: false },
    { dir: 'SE', deg: 135, isCorner: true },
    { dir: 'S', deg: 180, isCorner: false },
    { dir: 'SW', deg: 225, isCorner: true },
    { dir: 'W', deg: 270, isCorner: false },
    { dir: 'NW', deg: 315, isCorner: true },
  ];

  let sectorsKML = '';
  directions.forEach((d) => {
    const status = vectors ? (vectors[d.dir] || 'SAFE') : 'SAFE';
    const spread = d.isCorner ? 30 : 15;
    const coords = generateArcPolygonCoords(lat, lon, magNorthBearing + d.deg, spread, maxRadiusKm);
    
    sectorsKML += `
      <Placemark>
        <name>Sector ${d.dir} (${status})</name>
        <styleUrl>#style_${status}</styleUrl>
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
  const [mnLon, mnLat] = getDestinationKML(lat, lon, declination, maxRadiusKm);
  const magNorthKML = `
    <Placemark>
      <name>Magnetic North Vector (WMM)</name>
      <styleUrl>#magNorthStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${lon},${lat},0 ${mnLon},${mnLat},0</coordinates>
      </LineString>
    </Placemark>`;

  const kmlString = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Bio-Magnetic Spatial System</name>
    <description>Generated sector data aligned with current active evaluations.</description>
    
    <!-- Style definitions mapping to status colors -->
    <Style id="style_OPTIMAL">
      <LineStyle><color>ff81b910</color><width>2</width></LineStyle>
      <PolyStyle><color>6681b910</color></PolyStyle>
    </Style>
    <Style id="style_OPTIMAL_REGULAR">
      <LineStyle><color>ff99d334</color><width>1</width></LineStyle>
      <PolyStyle><color>5599d334</color></PolyStyle>
    </Style>
    <Style id="style_SAFE">
      <LineStyle><color>fff6823b</color><width>1</width></LineStyle>
      <PolyStyle><color>22f6823b</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_GOU">
      <LineStyle><color>ff4444ef</color><width>2</width></LineStyle>
      <PolyStyle><color>994444ef</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_ANKEN">
      <LineStyle><color>ff5e3ff4</color><width>2</width></LineStyle>
      <PolyStyle><color>995e3ff4</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_HA">
      <LineStyle><color>ff5e3ff4</color><width>2</width></LineStyle>
      <PolyStyle><color>995e3ff4</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_HONMEI">
      <LineStyle><color>ffef46d9</color><width>2</width></LineStyle>
      <PolyStyle><color>99ef46d9</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_TEKI">
      <LineStyle><color>ffd326c0</color><width>2</width></LineStyle>
      <PolyStyle><color>99d326c0</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_GETSUMEI">
      <LineStyle><color>ffd326c0</color><width>2</width></LineStyle>
      <PolyStyle><color>99d326c0</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_GETSUTEKI">
      <LineStyle><color>ffd326c0</color><width>2</width></LineStyle>
      <PolyStyle><color>99d326c0</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_VOID">
      <LineStyle><color>ff08b3ea</color><width>2</width></LineStyle>
      <PolyStyle><color>6608b3ea</color></PolyStyle>
    </Style>
    <Style id="style_NOISE_NODE">
      <LineStyle><color>ff0b9ef5</color><width>2</width></LineStyle>
      <PolyStyle><color>660b9ef5</color></PolyStyle>
    </Style>
    <Style id="style_NOISE">
      <LineStyle><color>ff4444ef</color><width>2</width></LineStyle>
      <PolyStyle><color>994444ef</color></PolyStyle>
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
      <name>Evaluated Sectors (30/60 Degree)</name>
      ${sectorsKML}
    </Folder>

    <Folder>
      <name>Shield Attenuation Rings (Amber)</name>
      ${ringsKML}
    </Folder>
  </Document>
</kml>`;

  return kmlString;
}

export function downloadKML(
  lat: number,
  lon: number,
  declination: number,
  useTrueNorth: boolean = false,
  vectors?: Record<string, string>
) {
  const kmlString = generateMagneticMapKML(lat, lon, declination, useTrueNorth, vectors);
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
