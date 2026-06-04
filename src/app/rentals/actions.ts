"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function generateRandomRental() {
  const areas = ["渋谷区", "新宿区", "港区", "目黒区", "世田谷区", "中央区"];
  const layouts = ["1K", "1LDK", "2LDK", "1R"];
  
  const area = areas[Math.floor(Math.random() * areas.length)];
  const layout = layouts[Math.floor(Math.random() * layouts.length)];
  const size_sqm = Math.floor(Math.random() * 40) + 20; // 20 - 60 sqm
  const rent = Math.floor(Math.random() * 150000) + 80000; // 80k - 230k
  const management_fee = Math.floor(Math.random() * 10000) + 5000;
  const minutes = Math.floor(Math.random() * 15) + 3;
  
  // Property name usually includes area or some grand word
  const names = ["レジデンス", "パークタワー", "ヒルズ", "ガーデン", "プレイス"];
  const nameSuffix = names[Math.floor(Math.random() * names.length)];
  const property_name = `${area}${nameSuffix}`;
  
  const is_new_build = Math.random() > 0.7; // 30% chance
  
  // Random past date for first_seen_at (0 to 45 days ago)
  const daysAgo = Math.floor(Math.random() * 45);
  const first_seen_at = new Date();
  first_seen_at.setDate(first_seen_at.getDate() - daysAgo);

  return {
    property_name,
    rent,
    management_fee,
    layout,
    size_sqm,
    area,
    minutes_to_station: minutes,
    is_new_build,
    first_seen_at: first_seen_at.toISOString(),
    last_seen_at: new Date().toISOString(), // seen today
  };
}

export async function addSampleData() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignored in server component
          }
        },
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Unauthorized. Please log in." };
  }

  // Generate 3 random properties
  const newProperties = [
    generateRandomRental(),
    generateRandomRental(),
    generateRandomRental(),
  ];

  const { error } = await supabase
    .from("rental_properties")
    .insert(newProperties);

  if (error) {
    console.error("Error inserting sample data:", error);
    return { success: false, error: "Failed to insert sample data." };
  }

  return { success: true };
}

export async function triggerRealScrape() {
  const gasUrl = process.env.GAS_RENTALS_WEBAPP_URL || process.env.GAS_WEBAPP_URL;
  if (!gasUrl) {
    return { success: false, error: "GAS_RENTALS_WEBAPP_URL or GAS_WEBAPP_URL environment variable is not configured." };
  }

  try {
    const res = await fetch(gasUrl, { method: "GET" });
    if (!res.ok) {
      return { success: false, error: `GAS Web App returned status ${res.status}` };
    }
    const data = await res.json();
    if (data && typeof data === 'object') {
      if ('success' in data) {
        return {
          success: !!data.success,
          error: data.error || (data.success ? undefined : "Unknown error returned from GAS Web App"),
          message: data.message
        };
      } else {
        console.warn("Unexpected GAS Web App response layout (missing 'success'):", data);
        return {
          success: false,
          error: "GAS Web App returned an unexpected response structure. It appears the GAS_WEBAPP_URL is pointing to the Trends RSS feed generator instead of the Rentals scraper Web App. Please configure GAS_RENTALS_WEBAPP_URL for the rentals scraper."
        };
      }
    }
    return { success: false, error: "GAS Web App returned a non-object response." };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
