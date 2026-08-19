"use client";

import React, { useRef, useEffect, useMemo } from "react";

interface MagneticSpatialHUDProps {
  declination: number; // 偏角 (D)
  inclination: number; // 伏角 (I)
  kpIndex: number; // 宇宙天気 (Weather)
  shieldCapacity: number; // シールド強度 (0-100)
  size?: number;
}

export function MagneticSpatialHUD({
  declination,
  inclination,
  kpIndex,
  shieldCapacity,
  size = 200,
}: MagneticSpatialHUDProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  // 1. ノイズの激しさを計算 (Kp Indexに基づく)
  const noiseIntensity = useMemo(
    () => Math.max(0, (kpIndex - 2) / 7),
    [kpIndex],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let angle = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = size * 0.4;

      // --- 3D Grid Floor (Background) ---
      ctx.strokeStyle = "rgba(63, 63, 70, 0.3)";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        // Horizontal lines with perspective
        ctx.beginPath();
        ctx.moveTo(centerX - radius * 2, centerY + i * 20 + 20);
        ctx.lineTo(centerX + radius * 2, centerY + i * 20 + 20);
        ctx.stroke();

        // Vertical lines with perspective
        ctx.beginPath();
        ctx.moveTo(centerX + i * 30, centerY);
        ctx.lineTo(centerX + i * 50, centerY + 60);
        ctx.stroke();
      }

      // --- Interference Sphere (Wireframe) ---
      const time = Date.now() * 0.001;
      ctx.strokeStyle =
        noiseIntensity > 0.4
          ? "rgba(239, 68, 68, 0.5)"
          : "rgba(59, 130, 246, 0.3)";
      ctx.lineWidth = 1;

      for (let j = 0; j < 6; j++) {
        ctx.beginPath();
        const r = radius + Math.sin(time * 2 + j) * 5 * noiseIntensity;
        ctx.ellipse(
          centerX,
          centerY,
          r,
          r * 0.6,
          ((angle + j * 30) * Math.PI) / 180,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }

      // --- Magnetic Vector Arrow (3D Representation) ---
      // Convert D and I to 3D direction
      // D is azimuth (North = 0), I is vertical (Horizontal = 0, Down = Positive)
      const radD = ((declination - 90) * Math.PI) / 180; // Adjust for canvas coordinate
      const radI = (inclination * Math.PI) / 180;

      const arrowLen = radius * 0.8;
      const targetX = centerX + Math.cos(radD) * Math.cos(radI) * arrowLen;
      const targetY = centerY + Math.sin(radI) * arrowLen * 0.5; // Flattened for perspective

      // Shadow of the arrow
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, centerY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Main Arrow Body
      const gradient = ctx.createLinearGradient(
        centerX,
        centerY,
        targetX,
        targetY,
      );
      gradient.addColorStop(0, "#3b82f6");
      gradient.addColorStop(1, "#60a5fa");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();

      // Arrow Head
      ctx.fillStyle = "#60a5fa";
      ctx.beginPath();
      ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
      ctx.fill();

      // --- Shield Dome (Foreground) ---
      const shieldAlpha = (shieldCapacity / 100) * 0.3;
      ctx.fillStyle = `rgba(16, 185, 129, ${shieldAlpha})`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.7, Math.PI, Math.PI * 2); // Top half dome
      ctx.fill();

      ctx.strokeStyle = `rgba(16, 185, 129, ${shieldAlpha * 2})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Disable continuous animation on mobile for performance
      const isMobile = window.innerWidth < 768;
      if (!isMobile) {
        angle += 0.5;
        frameRef.current = requestAnimationFrame(render);
      }
    };

    render();
    return () => cancelAnimationFrame(frameRef.current);
  }, [declination, inclination, noiseIntensity, shieldCapacity, size]);

  return (
    <div
      className="relative group cursor-help"
      style={{ width: size, height: size * 0.8 }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size * 0.8}
        className="w-full h-full"
      />

      {/* HUD Overlays */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center pointer-events-none select-none">
        <div className="text-[10px] font-mono text-blue-400/70 border-t border-blue-200 px-2 bg-white/70 md:backdrop-blur-sm">
          SPATIAL INTERFERENCE HUD v1.0
        </div>
        <div className="flex gap-4 text-[9px] font-mono text-stone-600 mt-0.5">
          <span>D: {declination.toFixed(1)}°</span>
          <span>I: {inclination.toFixed(1)}°</span>
          <span className={kpIndex >= 4 ? "text-red-500" : "text-emerald-500"}>
            WTH: Kp{kpIndex.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Hover Info */}
      <div className="absolute top-0 left-0 w-full h-full bg-white/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center items-center p-4 text-[9px] font-mono pointer-events-none text-stone-600 md:backdrop-blur-sm border border-blue-200">
        <div className="text-blue-600 mb-2 border-b border-blue-200 w-full text-center pb-1">
          3D VECTOR DIAGNOSIS
        </div>
        <div className="w-full flex justify-between">
          <span>INCLINATION (伏角):</span>
          <span className="text-stone-900">{inclination.toFixed(2)}°</span>
        </div>
        <div className="w-full flex justify-between">
          <span>DECLINATION (偏角):</span>
          <span className="text-stone-900">{declination.toFixed(2)}°</span>
        </div>
        <div className="w-full flex justify-between mt-1">
          <span>SHIELD CAP (護身):</span>
          <span className="text-emerald-500">{shieldCapacity}%</span>
        </div>
        <div className="mt-2 text-[9px] text-stone-600 leading-tight">
          磁力線の立体的な向きを可視化。伏角が急なほど、垂直方向のノイズ（天気）の影響を受けやすくなります。
        </div>
      </div>
    </div>
  );
}
