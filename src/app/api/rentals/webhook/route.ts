import { NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { toResponseMessage } from "@/lib/errorMessage";
import { recordApiCall, tokensFromAiSdkUsage } from "@/lib/apiUsage";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow more time for AI processing

const PropertySchema = z.object({
  properties: z.array(
    z.object({
      property_name: z
        .string()
        .describe(
          "The name of the property, including room number if available (e.g., 'アーバネックス銀座 201号室')",
        ),
      area: z
        .string()
        .nullable()
        .describe("The general area or address of the property"),
      rent: z
        .number()
        .nullable()
        .describe("The monthly rent in JPY (as an integer)"),
      management_fee: z
        .number()
        .nullable()
        .describe(
          "The monthly management fee or common area fee in JPY (as an integer, 0 if included in rent)",
        ),
      layout: z
        .string()
        .nullable()
        .describe("The floor plan/layout of the property (e.g., '1LDK', '1K')"),
      size_sqm: z
        .number()
        .nullable()
        .describe("The size of the property in square meters"),
      is_new_build: z
        .boolean()
        .nullable()
        .describe("Whether the property is newly built ('新築')"),
      minutes_to_station: z
        .number()
        .nullable()
        .describe("Walking minutes to the nearest station"),
      url: z
        .string()
        .nullable()
        .describe(
          "The URL link to the property listing, if available in the email body",
        ),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    // 1. Authenticate the Webhook via a Secret Key
    const authHeader = req.headers.get("authorization");
    const secretKey = process.env.API_SECRET_KEY;

    /*
      未設定のときに素通りさせない。以前は `secretKey && …` で、鍵が無いと
      検査ごと飛ばして誰でも通れた。この先は Gemini の呼び出し（課金）と
      rental_properties への書き込みなので、鍵が無いなら受け付けない。
      cron の 2 本（telemetry / search-console）と同じ扱い（503）。
    */
    if (!secretKey) {
      console.error("API_SECRET_KEY is not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    if (authHeader !== `Bearer ${secretKey}`) {
      console.warn("Unauthorized webhook access attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { email_id, subject, body, date } = await req.json();

    if (!body) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set. Cannot process email with AI.");
      return NextResponse.json(
        { error: "AI API Key not configured" },
        { status: 500 },
      );
    }

    // 1. Extract property details using Gemini
    const { object, usage } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: PropertySchema,
      prompt: `Extract real estate rental property information from the following email. If there are multiple properties, extract all of them.

Email Subject: ${subject}
Email Date: ${date}

Email Body:
${body}`,
    });

    await recordApiCall({
      provider: "google",
      model: "gemini-2.5-flash",
      route: "/api/rentals/webhook",
      ...tokensFromAiSdkUsage(usage),
    });

    const results = [];

    // 2. Save or update the listings.
    //
    // 書き込みは Prisma（DATABASE_URL）に統一している。Supabase クライアント
    // 経由だと、DB の引っ越し先を変えるたびにここだけ取り残される。
    // Supabase は認証のためだけに使う。
    for (const property of object.properties) {
      const emailDate = date ? new Date(date) : new Date();

      // Check if this specific property (by name and area/layout) already exists
      const existing = await prisma.rental_properties.findFirst({
        where: { property_name: property.property_name },
      });

      try {
        if (existing) {
          // Update the last_seen_at time and append the email id to source_emails
          const updatedSourceEmails = [...(existing.source_emails ?? [])];
          if (email_id && !updatedSourceEmails.includes(email_id)) {
            updatedSourceEmails.push(email_id);
          }

          const data = await prisma.rental_properties.update({
            where: { id: existing.id },
            data: {
              last_seen_at: emailDate,
              source_emails: updatedSourceEmails,
              // Optionally update other details if they changed, though rent/fees might fluctuate
              rent: property.rent ?? existing.rent,
            },
          });
          results.push({ action: "updated", property: data });
        } else {
          // Insert new property
          const data = await prisma.rental_properties.create({
            data: {
              property_name: property.property_name,
              area: property.area,
              rent: property.rent,
              management_fee: property.management_fee,
              layout: property.layout,
              size_sqm: property.size_sqm,
              is_new_build: property.is_new_build,
              minutes_to_station: property.minutes_to_station,
              first_seen_at: emailDate,
              last_seen_at: emailDate,
              source_emails: email_id ? [email_id] : [],
              url: property.url,
            },
          });
          results.push({ action: "inserted", property: data });
        }
      } catch (e) {
        // 1 件が落ちても残りは取り込む。元の実装も同じ扱いだった。
        console.error(`Error saving property ${property.property_name}`, e);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: toResponseMessage(error, "Internal server error") },
      { status: 500 },
    );
  }
}
