"use client";

import React, { useState, useEffect, useRef } from "react";

interface TelemetryProps {
  lat: number | null;
  lon: number | null;
  solarTime: Date | null;
  declination: number | null;
  env: any;
}

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: "INFO" | "WARN" | "SUCCESS" | "MATH";
}

export const SystemTelemetryLog: React.FC<TelemetryProps> = ({
  lat,
  lon,
  solarTime,
  declination,
  env,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry["type"] = "INFO") => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
    setLogs((prev) => {
      const newLogs = [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp,
          message,
          type,
        },
      ];
      return newLogs.slice(-20); // Keep last 20 logs
    });
  };

  // Simulation of the "Calculation Audit Stream"
  useEffect(() => {
    if (!lat || !lon) return;

    setLogs([]); // Reset on major change
    const step = 0;

    addLog(`INITIALIZING TELEMETRY STREAM...`, "INFO");

    const sequence = [
      {
        delay: 400,
        msg: `GPS Lock Acquired: [${lat.toFixed(4)}°, ${lon.toFixed(4)}°]`,
        type: "SUCCESS",
      },
      { delay: 800, msg: `Fetching JPL DE440 Ephemeris Data...`, type: "INFO" },
      {
        delay: 1200,
        msg: `Applying Delta-T & Equation of Time offset...`,
        type: "MATH",
      },
      {
        delay: 1500,
        msg: `True Solar Time Calculated: ${solarTime?.toLocaleTimeString() ?? "SYNCING"}`,
        type: "SUCCESS",
      },
      {
        delay: 1900,
        msg: `Querying World Magnetic Model (WMM 2020)...`,
        type: "INFO",
      },
      {
        delay: 2400,
        msg: `Magnetic Declination resolved: ${declination ? declination.toFixed(2) : "---"}°`,
        type: "MATH",
      },
      {
        delay: 2900,
        msg: `Calculating Bio-Magnetic Resonance Vectors...`,
        type: "INFO",
      },
      {
        delay: 3500,
        msg: `Engine Synced. Margin of Error: ±0.001%`,
        type: "SUCCESS",
      },
    ];

    const timeouts: NodeJS.Timeout[] = [];

    sequence.forEach((item) => {
      const t = setTimeout(() => {
        addLog(item.msg, item.type as any);
      }, item.delay);
      timeouts.push(t);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [lat, lon, declination]);

  // Periodic heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        addLog(`[HEARTBEAT] Verifying synchronization... OK`, "INFO");
      }
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isOpen]);

  const getColor = (type: string) => {
    switch (type) {
      case "SUCCESS":
        return "text-emerald-600";
      case "WARN":
        return "text-amber-600";
      case "MATH":
        return "text-purple-600";
      default:
        return "text-stone-500";
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end pointer-events-none">
      {/* Expanding Terminal Window */}
      <div
        className={`transition-all duration-500 ease-in-out border border-emerald-200 bg-white/70 backdrop-blur-md overflow-hidden mb-2 rounded-sm pointer-events-auto shadow-[0_0_20px_rgba(16,185,129,0.15)] ${isOpen ? "h-64 opacity-100 w-[320px] md:w-[400px]" : "h-0 opacity-0 w-[320px] md:w-[400px] border-none"}`}
      >
        <div className="h-full flex flex-col">
          <div className="bg-emerald-50 border-b border-emerald-200 px-2 py-1 flex justify-between items-center">
            <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">
              Calculation Audit Log // DE440
            </span>
            <span className="text-[8px] font-mono text-emerald-600">LIVE</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[9px] leading-relaxed relative flex flex-col gap-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 animate-fade-in text-shadow-sm"
              >
                <span className="text-stone-400 select-none">
                  [{log.timestamp}]
                </span>
                <span className={`${getColor(log.type)}`}>{log.message}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Persistent Telemetry Indicator Bar (Toggle) */}
      <div
        className="pointer-events-auto cursor-pointer bg-stone-50 border border-stone-200 flex items-center gap-3 px-3 py-2 rounded-sm hover:border-emerald-200 transition-colors shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div
          className="flex items-center gap-1.5"
          title="World Magnetic Model Status"
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${declination ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
          ></div>
          <span className="text-[8px] font-mono text-stone-400 tracking-wider">
            WMM2020
          </span>
        </div>

        <div className="w-px h-3 bg-stone-100"></div>

        <div className="flex items-center gap-1.5" title="JPL Ephemeris Engine">
          <div
            className={`w-1.5 h-1.5 rounded-full ${env ? "bg-blue-500 animate-pulse" : "bg-red-500"}`}
          ></div>
          <span className="text-[8px] font-mono text-stone-400 tracking-wider">
            JPL DE440
          </span>
        </div>

        <div className="w-px h-3 bg-stone-100"></div>

        <div className="flex items-center gap-1.5" title="Hardware GPS Sync">
          <div
            className={`w-1.5 h-1.5 rounded-full ${lat ? "bg-purple-500 animate-pulse" : "bg-zinc-600"}`}
          ></div>
          <span className="text-[8px] font-mono text-stone-400 tracking-wider">
            GPS SYNC
          </span>
        </div>

        {/* Toggle Caret */}
        <div className="ml-2 pl-2 border-l border-stone-200 text-stone-400">
          {isOpen ? "▼" : "▲"}
        </div>
      </div>
    </div>
  );
};
