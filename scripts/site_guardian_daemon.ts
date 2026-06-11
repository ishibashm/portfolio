import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fetchSpaceWeather } from "../src/utils/spaceWeather";
import {
  SwissEphemerisEngine,
  CelestialBody,
} from "../src/utils/swissEphemerisEngine";
import { OuraClient } from "../src/lib/ouraClient";
import prisma from "../src/lib/prisma";

// Load environmental variables
const envPath = fs.existsSync(path.resolve(process.cwd(), ".env"))
  ? path.resolve(process.cwd(), ".env")
  : path.resolve(process.cwd(), "../.env");
dotenv.config({ path: envPath });

const STATE_FILE = path.join(process.cwd(), "scripts", "daemon_state.json");
const LOG_FILE = path.join(process.cwd(), "data", "daemon_output.log");

interface DaemonState {
  lastKpIndexAlert: number | null;
  lastAnsLoadAlert: number | null;
  lastRetrogradeState: Record<string, boolean>; // planetName -> isRetrograde
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
    lastKpIndexAlert: null,
    lastAnsLoadAlert: null,
    lastRetrogradeState: {},
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

// Spawn Agent Runner Child Process and handle DB insertion/validation
function triggerAgentEvolution(
  triggerType: string,
  details: string,
  value: any,
) {
  writeLog(
    `🔥 Triggering Agent Evolution. Reason: [${triggerType}] ${details}`,
  );

  const runnerScript = path.join(
    process.cwd(),
    "scripts",
    "ai_agent_runner.py",
  );
  const base64Value = Buffer.from(JSON.stringify(value)).toString("base64");

  const pythonCmd = process.platform === "win32" ? "py" : "python3";

  const child = spawn(
    pythonCmd,
    [
      runnerScript,
      `--trigger=${triggerType}`,
      `--details=${details}`,
      `--value=${base64Value}`,
    ],
    {
      shell: true,
    },
  );

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (data) => {
    stdout += data.toString();
  });

  child.stderr?.on("data", (data) => {
    stderr += data.toString();
  });

  child.on("close", async (code) => {
    if (code !== 0) {
      writeLog(
        `[Error] Agent runner failed with code ${code}. Stderr: ${stderr}`,
      );
      try {
        await prisma.agentActivityLog.create({
          data: {
            triggerType,
            details,
            thoughtProcess: "Agent execution failed at runtime.",
            actions: "自律自己進化 (システムエラー)",
            codeChange: null,
            status: "FAILURE_ROLLEDBACK",
            errorMessage: `Exit code ${code}. Stderr: ${stderr}`,
          },
        });
      } catch (logErr: any) {
        writeLog(`Failed to log agent failure to DB: ${logErr.message}`);
      }
      return;
    }

    try {
      const match = stdout.match(
        /---AGENT_RESULT_START---([\s\S]*?)---AGENT_RESULT_END---/,
      );
      if (!match) {
        throw new Error(
          `Failed to find structured JSON in runner output. Raw stdout: ${stdout}`,
        );
      }

      const agentResponse = JSON.parse(match[1].trim());
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
              writeLog(
                `🛡️ [Immunization Rollback] Theme rejected: ${e.message}`,
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
          codeChange: agentResponse.toolCalls
            ? JSON.parse(JSON.stringify(agentResponse.toolCalls))
            : null,
          status: errorMessage ? "FAILURE_ROLLEDBACK" : "SUCCESS",
          errorMessage: errorMessage,
        },
      });
    } catch (err: any) {
      writeLog(`[Error] Failed to process agent runner output: ${err.message}`);
    }
  });
}

async function checkEnvironment(state: DaemonState): Promise<DaemonState> {
  const updatedState = { ...state, lastCheckedTime: new Date().toISOString() };
  writeLog("--- Starting Environment Health Check ---");

  // 1. Check Space Weather (Kp Index)
  try {
    const spaceWeather = await fetchSpaceWeather();
    const kpIndex = spaceWeather.kpIndex ?? 3.0;
    writeLog(`[Space Weather] Current Kp Index: ${kpIndex}`);

    if (kpIndex >= 5.0) {
      // Trigger if no alert triggered recently, or if index increased significantly
      if (state.lastKpIndexAlert === null || kpIndex > state.lastKpIndexAlert) {
        triggerAgentEvolution(
          "SPACE_WEATHER_ALERT",
          `High solar magnetic activity detected (Kp Index: ${kpIndex}). Security hardening and dark-mode optimization advised.`,
          { kpIndex },
        );
        updatedState.lastKpIndexAlert = kpIndex;
      }
    } else {
      updatedState.lastKpIndexAlert = null; // Reset when back to normal
    }
  } catch (e: any) {
    writeLog(`[Warning] Failed to fetch space weather: ${e.message}`);
  }

  // 2. Check Oura Biometrics (ANS Load)
  try {
    const oura = new OuraClient();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startDate = yesterday.toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];

    const readinessData = await oura.getDailyReadiness(startDate, endDate);
    const score = readinessData?.data?.[0]?.score ?? 80;
    const ansLoad = 100 - score;
    writeLog(
      `[Oura Biometrics] Current User ANS Load: ${ansLoad}% (Readiness: ${score})`,
    );

    if (ansLoad >= 80) {
      if (state.lastAnsLoadAlert === null || ansLoad > state.lastAnsLoadAlert) {
        triggerAgentEvolution(
          "USER_STRESS_ALERT",
          `High user ANS Load detected (${ansLoad}%). Dynamic calming layout parameters should be deployed.`,
          { ansLoad },
        );
        updatedState.lastAnsLoadAlert = ansLoad;
      }
    } else {
      updatedState.lastAnsLoadAlert = null; // Reset when back to normal
    }
  } catch (e: any) {
    writeLog(`[Warning] Failed to fetch Oura biometric data: ${e.message}`);
  }

  // 3. Check Planet Retrogrades (Mercury / Venus)
  try {
    const swissEngine = SwissEphemerisEngine.getInstance();
    const today = new Date();

    const planetsToCheck = {
      Mercury: CelestialBody.Mercury,
      Venus: CelestialBody.Venus,
    };

    const currentRetrogradeState: Record<string, boolean> = {};

    for (const [name, body] of Object.entries(planetsToCheck)) {
      const coords = swissEngine.getPlanetCoordinates(today, body);
      const isRetrograde = coords.speed < 0;
      currentRetrogradeState[name] = isRetrograde;

      const previousState = state.lastRetrogradeState[name] ?? false;
      writeLog(
        `[Ephemeris] ${name} is Retrograde: ${isRetrograde} (Previous: ${previousState})`,
      );

      if (isRetrograde !== previousState) {
        // State has changed!
        const direction = isRetrograde ? "started" : "ended";
        triggerAgentEvolution(
          "RETROGRADE_ALERT",
          `${name} Retrograde has ${direction}. Realigning development priorities.`,
          { planet: name, isRetrograde },
        );
      }
    }
    updatedState.lastRetrogradeState = currentRetrogradeState;
  } catch (e: any) {
    writeLog(`[Warning] Failed to check planet coordinates: ${e.message}`);
  }

  writeLog("--- Environmental Health Check Completed ---");
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
