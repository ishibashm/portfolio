import { NextResponse } from 'next/server';
import { normalize } from '@geolonia/normalize-japanese-addresses';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const result = await normalize(q);

    if (result.point && result.point.lat && result.point.lng) {
      return NextResponse.json({
        lat: result.point.lat,
        lon: result.point.lng,
        name: `${result.pref}${result.city}${result.town}${result.addr}`.replace(/null/g, '') || q
      });
    }

    // Fallback: If normalize fails, we can try nominatim or just return 404
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`, {
      headers: { 'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      const item = data[0];
      return NextResponse.json({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        name: item.display_name.split(',')[0] || q
      });
    }

    return NextResponse.json({ error: 'Location not found' }, { status: 404 });
  } catch (error) {
    console.error('Geocoding API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
