"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  onlyYoungAge: boolean; // 築5年以内の築浅物件のみ
  maxRent: number | null; // 家賃上限 (管理費込み)
}

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
  const names = [
    "レジデンス",
    "パークタワー",
    "ヒルズ",
    "ガーデン",
    "プレイス",
  ];
  const nameSuffix = names[Math.floor(Math.random() * names.length)];
  const property_name = `${area}${nameSuffix}`;

  const is_new_build = Math.random() > 0.7; // 30% chance
  const building_age = is_new_build ? 0 : Math.floor(Math.random() * 25) + 1; // 0 for new build, otherwise 1 to 25

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
    building_age,
    first_seen_at: first_seen_at.toISOString(),
    last_seen_at: new Date().toISOString(), // seen today
  };
}

export async function sendWebhookNotification(
  properties: any[],
  config: WebhookConfig,
) {
  if (!config.url || !config.enabled) return;

  // Apply filters
  const filtered = properties.filter((p) => {
    // 1. Filter by building age (onlyYoungAge: <= 5 years)
    if (config.onlyYoungAge) {
      const age = p.building_age;
      if (age === null || age === undefined || age > 5) {
        return false;
      }
    }
    // 2. Filter by max rent
    if (config.maxRent !== null && config.maxRent !== undefined) {
      const totalRent = (p.rent || 0) + (p.management_fee || 0);
      if (totalRent > config.maxRent) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) return;

  const isDiscord =
    config.url.includes("discord.com") || config.url.includes("discordapp.com");
  const isSlack = config.url.includes("hooks.slack.com");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const dashboardLink = `${siteUrl}/rentals`;

  try {
    if (isDiscord) {
      // Send properties in batches (Discord webhooks allow up to 10 embeds per message)
      const batchSize = 8;
      for (let i = 0; i < filtered.length; i += batchSize) {
        const batch = filtered.slice(i, i + batchSize);
        const embeds = batch.map((p) => {
          const totalRent = (p.rent || 0) + (p.management_fee || 0);
          const ageStr =
            p.building_age === 0 ? "新築" : `築${p.building_age}年`;
          const titleTags = [];
          if (p.is_new_build) titleTags.push("✨新築");
          else if (p.building_age !== null && p.building_age <= 5)
            titleTags.push("🆕築浅");

          const title = `🏠 新着物件: ${p.property_name} ${titleTags.join(" ")}`;

          return {
            title: title,
            url: dashboardLink,
            color:
              p.building_age !== null && p.building_age <= 5
                ? 16760100
                : 1096065, // Gold (FBBF24) or Emerald (10B981) in decimal
            fields: [
              {
                name: "賃料 (管理費)",
                value: `${(totalRent / 10000).toFixed(1)}万円 (${p.management_fee?.toLocaleString()}円)`,
                inline: true,
              },
              {
                name: "間取り / 面積",
                value: `${p.layout || "N/A"} / ${p.size_sqm}m²`,
                inline: true,
              },
              {
                name: "駅徒歩 / 築年数",
                value: `徒歩 ${p.minutes_to_station}分 / ${ageStr}`,
                inline: true,
              },
              {
                name: "エリア",
                value: p.area || "未設定",
                inline: true,
              },
              {
                name: "住所",
                value: p.address || "未設定",
                inline: false,
              },
            ],
            footer: {
              text: `Scraper: ${p.source_scraper || "Manual Sample"}`,
            },
            timestamp: new Date().toISOString(),
          };
        });

        await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `🔔 **新着物件を検出しました！ (全${filtered.length}件中、${i + 1}〜${Math.min(i + batchSize, filtered.length)}件表示)**`,
            embeds: embeds,
          }),
        });
      }
    } else if (isSlack) {
      // Send to Slack using basic block format
      for (const p of filtered) {
        const totalRent = (p.rent || 0) + (p.management_fee || 0);
        const ageStr = p.building_age === 0 ? "新築" : `築${p.building_age}年`;
        const titleTags = [];
        if (p.is_new_build) titleTags.push("✨新築");
        else if (p.building_age !== null && p.building_age <= 5)
          titleTags.push("🆕築浅");

        const blocks = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `🏠 新着物件: ${p.property_name} ${titleTags.join(" ")}`,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*賃料 (管理費):*\n${(totalRent / 10000).toFixed(1)}万円 (${p.management_fee?.toLocaleString()}円)`,
              },
              {
                type: "mrkdwn",
                text: `*間取り / 面積:*\n${p.layout || "N/A"} / ${p.size_sqm}m²`,
              },
              {
                type: "mrkdwn",
                text: `*駅徒歩 / 築年数:*\n徒歩 ${p.minutes_to_station}分 / ${ageStr}`,
              },
              {
                type: "mrkdwn",
                text: `*エリア:*\n${p.area || "未設定"}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*住所:* ${p.address || "未設定"}`,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Scraper: ${p.source_scraper || "Manual Sample"} | <${dashboardLink}|ダッシュボードで見る>`,
              },
            ],
          },
        ];

        await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks }),
        });
      }
    } else {
      // Generic Webhook POST (JSON format)
      await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "rentals.new_properties",
          count: filtered.length,
          properties: filtered,
          timestamp: new Date().toISOString(),
        }),
      });
    }
  } catch (err) {
    console.error("Failed to send webhook notification:", err);
  }
}

export async function sendTestNotification(url: string) {
  if (!url)
    return { success: false, error: "Webhook URLが入力されていません。" };

  const mockProperty = {
    property_name: "テスト用レジデンス目黒",
    rent: 125000,
    management_fee: 8000,
    layout: "1LDK",
    size_sqm: 40.5,
    minutes_to_station: 5,
    is_new_build: false,
    building_age: 3,
    area: "目黒区",
    address: "東京都目黒区大橋1-2-3",
    source_scraper: "Test Webhook Triggered",
  };

  try {
    const config: WebhookConfig = {
      enabled: true,
      url,
      onlyYoungAge: false,
      maxRent: null,
    };
    await sendWebhookNotification([mockProperty], config);
    return { success: true };
  } catch (e: any) {
    console.error("Test webhook error:", e);
    return {
      success: false,
      error: e.message || "Webhookの送信に失敗しました。",
    };
  }
}

export async function addSampleData(webhookConfig?: WebhookConfig) {
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
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignored in server component
          }
        },
      },
    },
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
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

  // Send webhook notification if configured
  if (webhookConfig && webhookConfig.enabled && webhookConfig.url) {
    await sendWebhookNotification(newProperties, webhookConfig);
  }

  return { success: true };
}

export async function triggerRealScrape(webhookConfig?: WebhookConfig) {
  const gasUrl =
    process.env.GAS_RENTALS_WEBAPP_URL || process.env.GAS_WEBAPP_URL;
  if (!gasUrl) {
    return {
      success: false,
      error:
        "GAS_RENTALS_WEBAPP_URL or GAS_WEBAPP_URL environment variable is not configured.",
    };
  }

  const startTime = new Date().toISOString();

  try {
    const res = await fetch(gasUrl, { method: "GET" });
    if (!res.ok) {
      return {
        success: false,
        error: `GAS Web App returned status ${res.status}`,
      };
    }
    const data = await res.json();
    if (data && typeof data === "object") {
      if ("success" in data) {
        const isSuccess = !!data.success;
        if (
          isSuccess &&
          webhookConfig &&
          webhookConfig.enabled &&
          webhookConfig.url
        ) {
          // Query newly added properties from Supabase since startTime
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
                      cookieStore.set(name, value, options),
                    );
                  } catch {
                    // Ignored in server component
                  }
                },
              },
            },
          );

          const { data: newProps, error: fetchErr } = await supabase
            .from("rental_properties")
            .select("*")
            .gte("first_seen_at", startTime);

          if (!fetchErr && newProps && newProps.length > 0) {
            await sendWebhookNotification(newProps, webhookConfig);
          }
        }

        return {
          success: isSuccess,
          error:
            data.error ||
            (data.success
              ? undefined
              : "Unknown error returned from GAS Web App"),
          message: data.message,
        };
      } else {
        console.warn(
          "Unexpected GAS Web App response layout (missing 'success'):",
          data,
        );
        return {
          success: false,
          error:
            "GAS Web App returned an unexpected response structure. It appears the GAS_WEBAPP_URL is pointing to the Trends RSS feed generator instead of the Rentals scraper Web App. Please configure GAS_RENTALS_WEBAPP_URL for the rentals scraper.",
        };
      }
    }
    return {
      success: false,
      error: "GAS Web App returned a non-object response.",
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
