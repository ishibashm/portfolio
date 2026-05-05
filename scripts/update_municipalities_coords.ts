import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function updateCoords() {
  const { default: prisma } = await import('../src/lib/prisma.js');

  console.log("Fetching CSV for Japanese municipalities from Geolonia...");
  const response = await fetch("https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv");
  const csvText = await response.text();

  const lines = csvText.split('\n');
  const coordMap = new Map();
  
  console.log(`Processing ${lines.length} lines of address data...`);

  // CSV Columns:
  // 0:PrefCode, 1:PrefName, 2:PrefKana, 3:PrefRomaji
  // 4:CityCode, 5:CityName, ...
  // 12:Lat, 13:Lon
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    // Simple CSV parse handling quotes
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''));
    
    if (cols.length >= 14) {
      const cityCode = cols[4];
      const lat = parseFloat(cols[12]);
      const lon = parseFloat(cols[13]);
      
      if (cityCode && !isNaN(lat) && !isNaN(lon)) {
        // We just take the first coordinate encountered for a city (usually sufficient for center approximation)
        if (!coordMap.has(cityCode)) {
          coordMap.set(cityCode, { lat, lon });
        }
      }
    }
  }

  console.log(`Found coordinates for ${coordMap.size} municipalities.`);

  const municipalities = await prisma.municipalityWealth.findMany();
  let matched = 0;
  
  console.log(`Updating database for ${municipalities.length} records...`);
  
  try {
    for (const m of municipalities) {
      const code = m.areaCode;
      const coords = coordMap.get(code);
      if (coords) {
        matched++;
        await prisma.municipalityWealth.update({
          where: { id: m.id },
          data: {
            lat: coords.lat,
            lon: coords.lon,
          }
        });
      } else {
        console.warn(`No coordinates found for areaCode: ${code} (${m.areaName})`);
      }
    }
    console.log(`Matched and updated coordinates for ${matched} out of ${municipalities.length} municipalities in the database.`);
  } catch (error) {
    console.error(error);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

updateCoords();