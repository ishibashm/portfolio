import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import prisma from "@/lib/prisma";
import { getLocalAgentDecision } from "@/utils/localAgentEngine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1. Supabase Admin Session Check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json(
        { error: "Unauthorized. Please login first." },
        { status: 401 },
      );
    }

    // [SECURITY] Require Admin Email
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ishibashm@gmail.com";
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Forbidden. Admin access required." },
        { status: 403 },
      );
    }

    // 2. Parse request payload
    const body = await req.json();
    const { message, telemetry } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    // [NEW] Fetch recent logs to provide context to the agent
    let systemLogs: any[] = [];
    try {
      systemLogs = await prisma.agentActivityLog.findMany({
        take: 10,
        orderBy: { timestamp: "desc" },
        select: {
          timestamp: true,
          triggerType: true,
          status: true,
          actions: true,
          errorMessage: true,
          details: true,
        },
      });
    } catch (e: any) {
      console.warn("Failed to fetch recent agent activity logs:", e.message);
    }

    const combinedTelemetry = {
      ...(telemetry || {}),
      systemLogs,
    };

    // 3. Invoke local TypeScript agent engine directly (Zero API Costs)
    const agentResponse = getLocalAgentDecision(
      "USER_CHAT",
      message,
      combinedTelemetry,
    );
    let themeApplied = false;
    let errorMessage: string | null = null;
    let appliedThemeData: any = null;

    // 5. Tool call handling & Validation (Level 1 Validation)
    if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
      for (const call of agentResponse.toolCalls) {
        if (call.name === "set_color_theme") {
          try {
            const args = call.arguments;

            // Level 1 validation: Hex pattern and number range check
            const hexRegex = /^#[0-9A-Fa-f]{6}$/;
            if (
              !hexRegex.test(args.background) ||
              !hexRegex.test(args.foreground) ||
              !hexRegex.test(args.accent) ||
              !hexRegex.test(args.glowColor)
            ) {
              throw new Error(
                "Validation Error: Invalid Color Hex Format (Must be #RRGGBB)",
              );
            }
            if (
              typeof args.glowIntensity !== "number" ||
              args.glowIntensity < 0 ||
              args.glowIntensity > 1 ||
              typeof args.noiseOpacity !== "number" ||
              args.noiseOpacity < 0 ||
              args.noiseOpacity > 0.2
            ) {
              throw new Error(
                "Validation Error: Numeric Parameters out of safety range",
              );
            }
            if (args.fontTheme !== "sans" && args.fontTheme !== "serif") {
              throw new Error(
                "Validation Error: fontTheme must be either 'sans' or 'serif'",
              );
            }

            // Write to database (Supabase via Prisma)
            appliedThemeData = await prisma.agentTheme.create({
              data: {
                background: args.background,
                foreground: args.foreground,
                accent: args.accent,
                glowColor: args.glowColor,
                glowIntensity: args.glowIntensity,
                animationSpeed: args.animationSpeed || "4s",
                fontTheme: args.fontTheme,
                noiseOpacity: args.noiseOpacity,
                borderRadius: args.borderRadius || "8px",
              },
            });
            themeApplied = true;
          } catch (e: any) {
            errorMessage = e.message;
            // Rollback is implicit: Skip applying changes on validation failure
          }
        } else if (call.name === "write_blog_post") {
          try {
            const args = call.arguments;

            if (!args.title || !args.content) {
              throw new Error(
                "Validation Error: Title and Content are required for blog posts",
              );
            }

            // Verify author exists in User table
            let authorId = user.id;
            const userExists = await prisma.user.findUnique({
              where: { id: user.id },
            });
            if (!userExists) {
              const firstUser = await prisma.user.findFirst();
              if (firstUser) {
                authorId = firstUser.id;
              } else {
                throw new Error(
                  "Validation Error: Logged in user not found in User table",
                );
              }
            }

            // Generate unique slug
            const dateStr = Date.now().toString();
            const cleanTitle = args.title
              .toLowerCase()
              .replace(
                /[^a-z0-9\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g,
                "-",
              )
              .replace(/-+/g, "-");
            const slug = `agent-${cleanTitle}-${dateStr}`;

            await prisma.blogPost.create({
              data: {
                id: `blog-${dateStr}-${Math.random().toString(36).substring(2, 7)}`,
                title: args.title,
                slug: slug,
                content: args.content,
                excerpt: args.excerpt || null,
                tags: args.tags || "AI, self-evolution",
                authorId: authorId,
                published: true,
                updatedAt: new Date(),
              },
            });
          } catch (e: any) {
            errorMessage = e.message;
          }
        }
      }
    }

    // 6. Write Activity Log using Prisma
    await prisma.agentActivityLog.create({
      data: {
        triggerType: "USER_CHAT",
        details: message,
        thoughtProcess: agentResponse.thoughtProcess,
        actions: agentResponse.actions,
        textResponse: agentResponse.textResponse || null,
        codeChange: agentResponse.toolCalls
          ? JSON.parse(JSON.stringify(agentResponse.toolCalls))
          : null,
        status: errorMessage ? "FAILURE_ROLLEDBACK" : "SUCCESS",
        errorMessage: errorMessage,
      },
    });

    return NextResponse.json({
      textResponse: agentResponse.textResponse,
      themeApplied,
      theme: themeApplied ? appliedThemeData : null,
      error: errorMessage,
    });
  } catch (error: any) {
    console.error("Agent Chat API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process agent request." },
      { status: 500 },
    );
  }
}
