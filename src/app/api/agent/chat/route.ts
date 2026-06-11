import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { spawn } from 'child_process';
import * as path from 'path';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    // 1. Supabase Admin Session Check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized. Please login first.' }, { status: 401 });
    }

    // 2. Parse request payload
    const body = await req.json();
    const { message, telemetry } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 3. Spawn Python Agent Runner (USER_CHAT mode)
    const runnerScript = path.join(process.cwd(), 'scripts', 'ai_agent_runner.py');
    const base64Value = Buffer.from(JSON.stringify(telemetry || {})).toString('base64');

    const pythonCmd = process.platform === 'win32' ? 'py' : 'python3';

    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(pythonCmd, [
        runnerScript,
        `--trigger=USER_CHAT`,
        `--details=${message}`,
        `--value=${base64Value}`
      ], { shell: true });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Runner failed with code ${code}. Stderr: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });

    // 4. Parse JSON out of Agent stdout
    const match = result.match(/---AGENT_RESULT_START---([\s\S]*?)---AGENT_RESULT_END---/);
    if (!match) {
      throw new Error(`Failed to find structured JSON in runner output. Raw output: ${result}`);
    }

    const agentResponse = JSON.parse(match[1].trim());
    let themeApplied = false;
    let errorMessage: string | null = null;
    let appliedThemeData: any = null;

    // 5. Tool call handling & Validation (Level 1 Validation)
    if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
      for (const call of agentResponse.toolCalls) {
        if (call.name === 'set_color_theme') {
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
              throw new Error("Validation Error: Invalid Color Hex Format (Must be #RRGGBB)");
            }
            if (
              typeof args.glowIntensity !== 'number' || args.glowIntensity < 0 || args.glowIntensity > 1 ||
              typeof args.noiseOpacity !== 'number' || args.noiseOpacity < 0 || args.noiseOpacity > 0.2
            ) {
              throw new Error("Validation Error: Numeric Parameters out of safety range");
            }
            if (args.fontTheme !== 'sans' && args.fontTheme !== 'serif') {
              throw new Error("Validation Error: fontTheme must be either 'sans' or 'serif'");
            }

            // Write to database (Supabase via Prisma)
            appliedThemeData = await prisma.agentTheme.create({
              data: {
                background: args.background,
                foreground: args.foreground,
                accent: args.accent,
                glowColor: args.glowColor,
                glowIntensity: args.glowIntensity,
                animationSpeed: args.animationSpeed || '4s',
                fontTheme: args.fontTheme,
                noiseOpacity: args.noiseOpacity,
                borderRadius: args.borderRadius || '8px'
              }
            });
            themeApplied = true;
          } catch (e: any) {
            errorMessage = e.message;
            // Rollback is implicit: Skip applying changes on validation failure
          }
        }
      }
    }

    // 6. Write Activity Log using Prisma
    await prisma.agentActivityLog.create({
      data: {
        triggerType: 'USER_CHAT',
        details: message,
        thoughtProcess: agentResponse.thoughtProcess,
        actions: agentResponse.actions,
        codeChange: agentResponse.toolCalls ? JSON.parse(JSON.stringify(agentResponse.toolCalls)) : null,
        status: errorMessage ? 'FAILURE_ROLLEDBACK' : 'SUCCESS',
        errorMessage: errorMessage
      }
    });

    return NextResponse.json({
      textResponse: agentResponse.textResponse,
      themeApplied,
      theme: themeApplied ? appliedThemeData : null,
      error: errorMessage
    });

  } catch (error: any) {
    console.error('Agent Chat API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process agent request.' }, { status: 500 });
  }
}
