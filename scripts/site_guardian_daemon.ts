import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import {
  Body,
  Observer,
  AstroTime,
  Equator,
  Horizontal,
} from "astronomy-engine";
import { getGeomagneticData } from "../src/utils/geomagnetism";
import prisma from "../src/lib/prisma";
import { getLocalAgentDecision } from "../src/utils/localAgentEngine";

// Load environmental variables
const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const STATE_FILE = path.join(process.cwd(), "scripts", "daemon_state.json");
const LOG_FILE = path.join(process.cwd(), "data", "daemon_output.log");

interface DaemonState {
  lastSolarAzimuth: number | null;
  lastSolarElevation: number | null;
  lastCheckedTime: string | null;
}

// Ensure data folder exists
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function writeLog(message: string) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(LOG_FILE, formattedMessage, "utf-8");
}

function loadState(): DaemonState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    writeLog(`Failed to load daemon state, using default state.`);
  }
  return {
    lastSolarAzimuth: null,
    lastSolarElevation: null,
    lastCheckedTime: null,
  };
}

function saveState(state: DaemonState) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    writeLog(`Error saving daemon state: ${e}`);
  }
}

// Handle agent evolution using native local agent decision engine
async function triggerAgentEvolution(
  triggerType: string,
  details: string,
  value: any,
) {
  writeLog(
    `🔥 Triggering Agent Evolution (Local TS Engine). Reason: [${triggerType}] ${details}`,
  );

  // Fetch recent logs to provide context to the agent
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
    writeLog(`Failed to fetch recent agent activity logs: ${e.message}`);
  }

  const combinedValue = {
    ...(value || {}),
    systemLogs,
  };

  try {
    // Native execution of rules-based themes and chat responses
    const agentResponse = getLocalAgentDecision(
      triggerType,
      details,
      combinedValue,
    );
    let themeApplied = false;
    let errorMessage: string | null = null;

    if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
      for (const call of agentResponse.toolCalls) {
        if (call.name === "set_color_theme") {
          try {
            const args = call.arguments;

            // Level 1 Validation (Hex pattern and number range check)
            const hexRegex = /^#[0-9A-Fa-f]{6}$/;
            if (
              !hexRegex.test(args.background) ||
              !hexRegex.test(args.foreground) ||
              !hexRegex.test(args.accent) ||
              !hexRegex.test(args.glowColor)
            ) {
              throw new Error("Validation Error: Invalid Color Hex Format");
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

            // Save to database
            await prisma.agentTheme.create({
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
            writeLog(
              `🎨 [Theme Applied] New self-evolved theme written to DB.`,
            );
          } catch (e: any) {
            errorMessage = e.message;
            writeLog(`🛡️ [Immunization Rollback] Theme rejected: ${e.message}`);
          }
        } else if (call.name === "write_blog_post") {
          try {
            const args = call.arguments;

            if (!args.title || !args.content) {
              throw new Error(
                "Validation Error: Title and Content are required for blog posts",
              );
            }

            // Get default author (first user)
            const firstUser = await prisma.user.findFirst();
            if (!firstUser) {
              throw new Error(
                "Validation Error: No user found in User table to assign as author",
              );
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
                authorId: firstUser.id,
                published: true,
                updatedAt: new Date(),
              },
            });
            writeLog(
              `📝 [Blog Posted] Autonomous diary post saved to DB: ${args.title}`,
            );
          } catch (e: any) {
            errorMessage = e.message;
            writeLog(
              `🛡️ [Immunization Rollback] Blog post rejected: ${e.message}`,
            );
          }
        }
      }
    }

    // Save Activity Log
    await prisma.agentActivityLog.create({
      data: {
        triggerType,
        details,
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
  } catch (err: any) {
    writeLog(
      `[Error] Failed to process agent local engine execution: ${err.message}`,
    );
    try {
      await prisma.agentActivityLog.create({
        data: {
          triggerType,
          details,
          thoughtProcess: "Agent local engine failed at runtime.",
          actions: "自律自己進化 (システムエラー)",
          codeChange: null,
          status: "FAILURE_ROLLEDBACK",
          errorMessage: err.message,
        },
      });
    } catch (logErr: any) {
      writeLog(`Failed to log agent failure to DB: ${logErr.message}`);
    }
  }
}

async function checkEnvironment(state: DaemonState): Promise<DaemonState> {
  const updatedState = { ...state, lastCheckedTime: new Date().toISOString() };
  writeLog("--- Starting Spatial Orientation & Alignment Check ---");

  const today = new Date();

  // Baseline observer location: Tokyo (35.6895° N, 139.6917° E)
  const defaultLat = 35.6895;
  const defaultLon = 139.6917;
  let lat = defaultLat;
  let lon = defaultLon;

  try {
    const envLat = process.env.OBSERVER_LAT
      ? parseFloat(process.env.OBSERVER_LAT)
      : NaN;
    const envLon = process.env.OBSERVER_LON
      ? parseFloat(process.env.OBSERVER_LON)
      : NaN;
    if (!isNaN(envLat) && envLat >= -90 && envLat <= 90) {
      lat = envLat;
    }
    if (!isNaN(envLon) && envLon >= -180 && envLon <= 180) {
      lon = envLon;
    }
  } catch (e: any) {
    writeLog(
      `[Warning] Failed to parse observer coordinates from env: ${e.message}`,
    );
  }

  // 1. Calculate Solar Coordinates (Azimuth & Elevation)
  let solarAzimuth = 180;
  let solarElevation = 45;
  try {
    const observer = new Observer(lat, lon, 0);
    const time = new AstroTime(today);
    const equ = Equator(Body.Sun, time, observer, true, true);
    const hor = Horizontal(time, observer, equ.ra, equ.dec, "apparent");
    solarAzimuth = hor.azimuth;
    solarElevation = hor.altitude;
    writeLog(
      `[Solar Telemetry] Azimuth: ${solarAzimuth.toFixed(2)}°, Elevation: ${solarElevation.toFixed(2)}°`,
    );
  } catch (e: any) {
    writeLog(`[Warning] Failed to calculate solar positions: ${e.message}`);
  }

  // 2. Fetch Geomagnetic Vectoring
  let declination = 0;
  let inclination = 0;
  try {
    const geoData = await getGeomagneticData(lat, lon, today.getTime());
    if (geoData) {
      declination = geoData.declination;
      inclination = geoData.inclination;
      writeLog(
        `[Geomagnetic Telemetry] Declination: ${declination.toFixed(2)}°, Inclination: ${inclination.toFixed(2)}°`,
      );
    }
  } catch (e: any) {
    writeLog(`[Warning] Failed to calculate geomagnetism: ${e.message}`);
  }

  // 3. Trigger alignment optimization audit
  // Trigger on state change or periodically (if azimuth changes more than 15 degrees)
  const angleDelta =
    state.lastSolarAzimuth !== null
      ? Math.abs(solarAzimuth - state.lastSolarAzimuth)
      : 999;

  if (angleDelta >= 15.0) {
    triggerAgentEvolution(
      "SOLAR_ALIGNMENT_CHECK",
      `System spatial alignment audit triggered. Solar Azimuth at ${solarAzimuth.toFixed(1)}°, Geomagnetic Declination at ${declination.toFixed(2)}°. Realigning focus vectors.`,
      {
        solarAzimuth,
        solarElevation,
        declination,
        inclination,
        timestamp: today.toISOString(),
      },
    );
    updatedState.lastSolarAzimuth = solarAzimuth;
    updatedState.lastSolarElevation = solarElevation;
  }

  writeLog("--- Spatial Orientation & Alignment Check Completed ---");
  return updatedState;
}

async function main() {
  writeLog("🚀 Starting Site Guardian Daemon Process...");
  let state = loadState();

  // Mode configurations: Set POLL_INTERVAL_MS via env or default to 1 hour
  // For testing purposes, setting standard interval to 1 hour (3600000ms)
  // Can be override to shorter duration in dev
  const intervalMs = process.env.DAEMON_POLL_INTERVAL
    ? parseInt(process.env.DAEMON_POLL_INTERVAL, 10)
    : 3600000;

  writeLog(`Polling interval set to: ${intervalMs / 1000} seconds.`);

  // Run initial check
  try {
    state = await checkEnvironment(state);
    saveState(state);
  } catch (err: any) {
    writeLog(`Critical error in daemon check loop: ${err.message}`);
  }

  // Schedule next checks
  setInterval(async () => {
    try {
      state = await checkEnvironment(state);
      saveState(state);
    } catch (err: any) {
      writeLog(`Critical error in daemon check loop: ${err.message}`);
    }
  }, intervalMs);
}

main().catch((err) => {
  writeLog(`Fatal daemon error: ${err.message}`);
  process.exit(1);
});
