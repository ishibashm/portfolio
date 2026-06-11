async function GET(q) {
  const { normalize } = require("@geolonia/normalize-japanese-addresses");
  try {
    const result = await normalize(q);

    if (result.point && result.point.lat && result.point.lng) {
      return {
        lat: result.point.lat,
        lon: result.point.lng,
        name:
          `${result.pref}${result.city}${result.town}${result.addr}`.replace(
            /null/g,
            "",
          ) || q,
      };
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      {
        headers: {
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          "User-Agent": "Portfolio-App/1.0 (Contact: local-admin@example.com)",
        },
      },
    );

    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        return {
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          name: item.display_name.split(",")[0] || q,
        };
      }
    } else {
      console.error(`Nominatim API returned ${res.status} ${res.statusText}`);
    }

    return { error: "Location not found", nominatimFallback: true };
  } catch (error) {
    console.error("Geocoding API error:", error);
    return { error: "Internal Server Error" };
  }
}

GET("Iowa, USA").then(console.log).catch(console.error);
