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

function getStatusLabel(status: string): string {
  if (status === 'NOISE_GOU') return '五黄';
  if (status === 'NOISE_ANKEN') return '暗剣';
  if (status === 'NOISE_HA') return '破';
  if (status === 'NOISE_HONMEI') return '本命';
  if (status === 'NOISE_TEKI') return '的殺';
  if (status === 'NOISE_VOID') return 'ボイド';
  if (status === 'NOISE_NODE') return '交点';
  if (status === 'OPTIMAL') return '大吉';
  if (status === 'OPTIMAL_REGULAR') return '吉';
  if (status === 'WARNING') return '注意';
  return '';
}

export function generateMagneticMapKML(
  lat: number,
  lon: number,
  declination: number,
  useTrueNorth: boolean = false,
  vectors?: Record<string, string>,
  nodeMapping: 'traditional' | 'physical' = 'traditional',
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean; hazard?: boolean },
  maxRadiusKm: number = 1000
): string {
  const magNorthBearing = useTrueNorth ? 0 : declination;

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
  let labelsKML = '';

  directions.forEach((d) => {
    const rawStatus = vectors ? (vectors[d.dir] || 'SAFE') : 'SAFE';
    
    // Apply HUD Layer Filtering to match Leaflet map visual state
    let displayStatus = 'SAFE';
    const hasTerrainNoise = rawStatus === 'NOISE';
    const hasBioNoise = rawStatus.includes('HONMEI') || rawStatus.includes('TEKI');
    const hasWeatherNoise = rawStatus.includes('NOISE') && !hasBioNoise && !hasTerrainNoise;

    if (!hudLayers) {
      displayStatus = rawStatus;
    } else {
      if (hudLayers.terrain && hasTerrainNoise) displayStatus = rawStatus;
      if (hudLayers.weather && hasWeatherNoise) displayStatus = rawStatus;
      if (hudLayers.bio && hasBioNoise) displayStatus = rawStatus;
      if (!rawStatus.includes('NOISE')) displayStatus = rawStatus;
    }

    // Determine sector angles layout
    const spread = nodeMapping === 'physical'
      ? 22.5
      : (d.isCorner ? 30 : 15);

    const coords = generateArcPolygonCoords(lat, lon, magNorthBearing + d.deg, spread, maxRadiusKm);
    
    sectorsKML += `
      <Placemark>
        <name>Sector ${d.dir} (${displayStatus})</name>
        <styleUrl>#style_${displayStatus}</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>`;

    const label = getStatusLabel(displayStatus);
    if (label) {
      const [labelLon, labelLat] = getDestinationKML(lat, lon, magNorthBearing + d.deg, maxRadiusKm * 0.4);
      labelsKML += `
      <Placemark>
        <name>${label}</name>
        <description>${d.dir} Sector Label (${displayStatus})</description>
        <styleUrl>#label_${displayStatus}</styleUrl>
        <Point>
          <coordinates>${labelLon},${labelLat},0</coordinates>
        </Point>
      </Placemark>`;
    }
  });

  // Boundary Danger Zones (Red Wedges)
  const boundaries = nodeMapping === 'physical'
    ? [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]
    : [15, 75, 105, 165, 195, 255, 285, 345];

  let dangerWedgesKML = '';
  boundaries.forEach((b, idx) => {
    const baseBearing = magNorthBearing + b;
    const coords = generateArcPolygonCoords(lat, lon, baseBearing, 2, maxRadiusKm);
    dangerWedgesKML += `
      <Placemark>
        <name>Boundary Danger Zone ${idx + 1}</name>
        <styleUrl>#boundaryDangerStyle</styleUrl>
        <Polygon>
          <tessellate>1</tessellate>
          <outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs>
        </Polygon>
      </Placemark>`;
  });

  // Attenuation Rings (Zinc) - 250km, 500km, 1000km to match Leaflet map
  const attenuationRings = [250, 500, 1000];
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
    <Style id="style_WARNING">
      <LineStyle><color>ff00a5ff</color><width>2</width></LineStyle>
      <PolyStyle><color>6600a5ff</color></PolyStyle>
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

    <Style id="boundaryDangerStyle">
      <LineStyle><color>004444ef</color><width>0</width></LineStyle>
      <PolyStyle><color>664444ef</color></PolyStyle>
    </Style>

    <Style id="ringStyle">
      <LineStyle><color>ff7a7a7a</color><width>1</width></LineStyle>
    </Style>

    <Style id="trueNorthStyle">
      <LineStyle><color>ff81b910</color><width>3</width></LineStyle>
    </Style>

    <Style id="magNorthStyle">
      <LineStyle><color>fff6823b</color><width>3</width></LineStyle>
    </Style>

    <!-- Label style definitions mapping to status colors -->
    <Style id="label_OPTIMAL">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff81b910</color><scale>1.2</scale></LabelStyle>
    </Style>
    <Style id="label_OPTIMAL_REGULAR">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff99d334</color><scale>1.1</scale></LabelStyle>
    </Style>
    <Style id="label_SAFE">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>fff6823b</color><scale>0.0</scale></LabelStyle>
    </Style>
    <Style id="label_WARNING">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff00a5ff</color><scale>1.2</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_GOU">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff4444ef</color><scale>1.3</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_ANKEN">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff5e3ff4</color><scale>1.3</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_HA">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff5e3ff4</color><scale>1.3</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_HONMEI">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ffef46d9</color><scale>1.2</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_TEKI">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ffd326c0</color><scale>1.2</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_VOID">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff08b3ea</color><scale>1.1</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE_NODE">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff0b9ef5</color><scale>1.1</scale></LabelStyle>
    </Style>
    <Style id="label_NOISE">
      <IconStyle><scale>0</scale></IconStyle>
      <LabelStyle><color>ff4444ef</color><scale>1.2</scale></LabelStyle>
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
      <name>Evaluated Sectors (${nodeMapping === 'physical' ? '45 Degree' : '30/60 Degree'})</name>
      ${sectorsKML}
    </Folder>

    <Folder>
      <name>Sector Status Labels</name>
      ${labelsKML}
    </Folder>

    <Folder>
      <name>Boundary Danger Zones (Red Wedges)</name>
      ${dangerWedgesKML}
    </Folder>

    <Folder>
      <name>Shield Attenuation Rings (Zinc)</name>
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
  vectors?: Record<string, string>,
  nodeMapping: 'traditional' | 'physical' = 'traditional',
  hudLayers?: { terrain: boolean; weather: boolean; bio: boolean; hazard?: boolean }
) {
  const kmlString = generateMagneticMapKML(lat, lon, declination, useTrueNorth, vectors, nodeMapping, hudLayers);
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
