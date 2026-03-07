import { NextResponse } from 'next/server';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

export const maxDuration = 60; // Allow more time for AI processing



const PropertySchema = z.object({
  properties: z.array(z.object({
    property_name: z.string().describe("The name of the property, including room number if available (e.g., 'アーバネックス銀座 201号室')"),
    area: z.string().nullable().describe("The general area or address of the property"),
    rent: z.number().nullable().describe("The monthly rent in JPY (as an integer)"),
    management_fee: z.number().nullable().describe("The monthly management fee or common area fee in JPY (as an integer, 0 if included in rent)"),
    layout: z.string().nullable().describe("The floor plan/layout of the property (e.g., '1LDK', '1K')"),
    size_sqm: z.number().nullable().describe("The size of the property in square meters"),
    is_new_build: z.boolean().nullable().describe("Whether the property is newly built ('新築')"),
    minutes_to_station: z.number().nullable().describe("Walking minutes to the nearest station"),
    url: z.string().nullable().describe("The URL link to the property listing, if available in the email body"),
  }))
});

export async function POST(req: Request) {
  try {
    const { email_id, subject, body, date } = await req.json();

    if (!body) {
      return NextResponse.json({ error: 'Body is required' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not set. Cannot process email with AI.");
      return NextResponse.json({ error: 'AI API Key not configured' }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn("Supabase credentials are not set.");
      return NextResponse.json({ error: 'Database credentials not configured' }, { status: 500 });
    }
    
    const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

    // 1. Extract property details using Gemini
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: PropertySchema,
      prompt: `Extract real estate rental property information from the following email. If there are multiple properties, extract all of them.

Email Subject: ${subject}
Email Date: ${date}

Email Body:
${body}`,
    });

    const results = [];

    // 2. Save or Update in Supabase
    for (const property of object.properties) {
      const emailDate = date ? new Date(date).toISOString() : new Date().toISOString();

      // Check if this specific property (by name and area/layout) already exists
      const { data: existing } = await supabase
        .from('rental_properties')
        .select('*')
        .eq('property_name', property.property_name)
        .limit(1)
        .single();

      if (existing) {
        // Update the last_seen_at time and append the email id to source_emails
        const updatedSourceEmails = existing.source_emails ? [...existing.source_emails] : [];
        if (email_id && !updatedSourceEmails.includes(email_id)) {
          updatedSourceEmails.push(email_id);
        }

        const { data, error } = await supabase
          .from('rental_properties')
          .update({
            last_seen_at: emailDate,
            source_emails: updatedSourceEmails,
            // Optionally update other details if they changed, though rent/fees might fluctuate
            rent: property.rent || existing.rent,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) console.error("Error updating property", error);
        if (data) results.push({ action: 'updated', property: data });
      } else {
        // Insert new property
        const { data, error } = await supabase
          .from('rental_properties')
          .insert({
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
          })
          .select()
          .single();

        if (error) console.error("Error inserting property", error);
        if (data) results.push({ action: 'inserted', property: data });
      }
    }

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
